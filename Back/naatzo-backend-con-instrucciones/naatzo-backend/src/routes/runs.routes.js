// src/routes/runs.routes.js
//   POST /api/projects/:id/runs   arranca la cadena de agentes (202 con runId)
//   GET  /api/runs/:id            estado y pasos guardados
//   GET  /api/runs/:id/events     eventos en vivo por SSE (?token=...)
//   POST /api/runs/:id/approve    aprueba el plan y sigue con DevOps y Notificador
//   POST /api/runs/:id/retry      reintenta desde un paso: { "from": "devops" }
//   POST /api/runs/:id/cancel     cancela la ejecucion

const express = require("express");
const { z } = require("zod");
const db = require("../db");
const bus = require("../orchestrator/bus");
const store = require("../orchestrator/store");
const { startPipeline, linksFrom } = require("../orchestrator/runPipeline");
const { asyncHandler } = require("../middleware/errorHandler");
const { requireAuth, requireAuthSse } = require("../middleware/auth");
const { getOwnedProject, getOwnedRun } = require("../db/access");
const { validate, conflict, badRequest } = require("../utils/http");
const serialize = require("../utils/serialize");

function buildRunsRouter({ aiLimiter }) {
  const router = express.Router();

  // ─── Arrancar ─────────────────────────────────────────────────────────────
  const StartSchema = z.object({ requireApproval: z.boolean().default(true) });

  router.post(
    "/projects/:id/runs",
    requireAuth,
    aiLimiter,
    asyncHandler(async (req, res) => {
      const project = await getOwnedProject(req.user.id, req.params.id);
      const { requireApproval } = validate(StartSchema, req.body);

      // Una sola ejecucion viva por proyecto: lo garantiza el indice unico
      // parcial runs_one_active_per_project (migracion 002).
      let run;
      try {
        const { rows } = await db.query(
          "INSERT INTO runs (project_id, require_approval) VALUES ($1, $2) RETURNING *",
          [project.id, requireApproval],
        );
        run = rows[0];
      } catch (err) {
        if (err.code === "23505") throw conflict("Este proyecto ya tiene una ejecucion en curso");
        throw err;
      }
      await db.query("UPDATE projects SET status = 'running', updated_at = NOW() WHERE id = $1", [
        project.id,
      ]);
      startPipeline(run.id);
      res.status(202).json({ ok: true, runId: run.id, status: run.status });
    }),
  );

  // ─── Estado y pasos ───────────────────────────────────────────────────────
  router.get(
    "/runs/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const run = await getOwnedRun(req.user.id, req.params.id);
      const steps = await store.listSteps(run.id);
      const outputs = await store.latestOutputs(run.id);
      res.json({
        ok: true,
        run: { ...serialize.run(run), links: linksFrom(outputs) },
        steps: steps.map(serializeStep),
      });
    }),
  );

  // ─── SSE ──────────────────────────────────────────────────────────────────
  router.get(
    "/runs/:id/events",
    requireAuthSse,
    asyncHandler(async (req, res) => {
      const run = await getOwnedRun(req.user.id, req.params.id);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      let closed = false;
      const write = (event) => {
        if (closed) return;
        const { type, ...data } = event;
        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
        if (["completed", "failed", "cancelled"].includes(type)) finish();
      };

      // Mientras se manda la historia guardada, lo que llegue en vivo se
      // acumula y se manda despues, para no desordenar los eventos.
      let buffer = [];
      const unsubscribe = bus.subscribe(run.id, (event) => {
        if (buffer) buffer.push(event);
        else write(event);
      });
      const heartbeat = setInterval(() => !closed && res.write(": ping\n\n"), 15_000);

      function finish() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        res.end();
      }
      req.on("close", finish);

      // 1) Historia: pasos ya guardados y estado actual
      const sent = new Set();
      for (const s of await store.listSteps(run.id)) {
        const ev = stepEvent(s);
        sent.add(`${s.agent}:${s.status}`);
        write(ev);
      }
      const current = await store.getRun(run.id);
      const pending = buffer;
      buffer = null;

      // 2) Lo que llego en vivo durante la historia (sin repetir pasos)
      for (const ev of pending) {
        if (ev.type === "step" && sent.has(`${ev.agent}:${ev.status}`)) continue;
        write(ev);
      }

      // 3) Si la ejecucion ya estaba parada, se avisa y se cierra
      if (!pending.some((ev) => ["awaiting_approval", "completed", "failed"].includes(ev.type))) {
        if (current.status === "awaiting_approval") write({ type: "awaiting_approval", runId: run.id });
        if (current.status === "completed") {
          write({ type: "completed", runId: run.id, links: linksFrom(await store.latestOutputs(run.id)) });
        }
        if (current.status === "failed") write({ type: "failed", runId: run.id, error: current.error });
        if (current.status === "cancelled") write({ type: "cancelled", runId: run.id });
      }
    }),
  );

  // ─── Aprobar ──────────────────────────────────────────────────────────────
  router.post(
    "/runs/:id/approve",
    requireAuth,
    asyncHandler(async (req, res) => {
      const run = await getOwnedRun(req.user.id, req.params.id);
      // Cambio atomico: si dos personas aprueban a la vez, solo una gana.
      const { rows } = await db.query(
        `UPDATE runs SET status = 'provisioning'
         WHERE id = $1 AND status = 'awaiting_approval' RETURNING *`,
        [run.id],
      );
      if (rows.length === 0) {
        throw conflict(`La ejecucion no espera aprobacion (estado: ${run.status})`);
      }
      bus.emit(run.id, { type: "approved" });
      startPipeline(run.id, { from: "devops" });
      res.status(202).json({ ok: true, runId: run.id, status: "provisioning" });
    }),
  );

  // ─── Reintentar ───────────────────────────────────────────────────────────
  const RetrySchema = z.object({ from: z.enum(store.AGENTS).optional() });

  router.post(
    "/runs/:id/retry",
    requireAuth,
    aiLimiter,
    asyncHandler(async (req, res) => {
      const run = await getOwnedRun(req.user.id, req.params.id);
      const body = validate(RetrySchema, req.body);
      if (!["failed", "cancelled"].includes(run.status)) {
        throw conflict(`Solo se reintenta una ejecucion fallida o cancelada (estado: ${run.status})`);
      }
      // Por defecto se reanuda desde el paso que fallo.
      const from = body.from || (store.AGENTS.includes(run.current_step) ? run.current_step : "analyst");

      // Los pasos anteriores a "from" tienen que tener salida guardada.
      const outputs = await store.latestOutputs(run.id);
      const missing = store.AGENTS.slice(0, store.AGENTS.indexOf(from)).find((a) => !outputs[a]);
      if (missing) throw badRequest(`No se puede reintentar desde ${from}: falta la salida de ${missing}`);

      let rows;
      try {
        ({ rows } = await db.query(
          `UPDATE runs SET status = 'queued', error = NULL, finished_at = NULL
           WHERE id = $1 AND status IN ('failed','cancelled') RETURNING *`,
          [run.id],
        ));
      } catch (err) {
        if (err.code === "23505") throw conflict("Este proyecto ya tiene otra ejecucion en curso");
        throw err;
      }
      if (rows.length === 0) throw conflict("La ejecucion cambio de estado; intenta de nuevo");
      bus.emit(run.id, { type: "retry", from });
      startPipeline(run.id, { from });
      res.status(202).json({ ok: true, runId: run.id, status: "queued", from });
    }),
  );

  // ─── Cancelar ─────────────────────────────────────────────────────────────
  router.post(
    "/runs/:id/cancel",
    requireAuth,
    asyncHandler(async (req, res) => {
      const run = await getOwnedRun(req.user.id, req.params.id);
      if (!store.ACTIVE_STATUSES.includes(run.status)) {
        throw conflict(`La ejecucion ya termino (estado: ${run.status})`);
      }
      // El paso que este corriendo termina, pero no arranca el siguiente.
      await store.setStatus(run.id, "cancelled");
      bus.emit(run.id, { type: "cancelled" });
      res.json({ ok: true, runId: run.id, status: "cancelled" });
    }),
  );

  return router;
}

function serializeStep(s) {
  return {
    id: Number(s.id),
    agent: s.agent,
    status: s.status,
    summary: s.output?.summary || null,
    error: s.output?.error || null,
    model: s.model,
    inputTokens: s.input_tokens,
    outputTokens: s.output_tokens,
    durationMs: s.duration_ms,
    input: s.input,
    output: s.output,
    createdAt: s.created_at,
  };
}

function stepEvent(s) {
  return {
    type: "step",
    agent: s.agent,
    status: s.status,
    summary: s.output?.summary,
    error: s.output?.error,
    durationMs: s.duration_ms,
    replay: true,
  };
}

module.exports = { buildRunsRouter };

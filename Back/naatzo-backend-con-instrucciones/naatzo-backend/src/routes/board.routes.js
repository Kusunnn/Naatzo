// src/routes/board.routes.js
//
// Tablero propio estilo Trello (en lugar de consumir la API de Trello).
//   GET    /api/projects/:id/board            listas con tarjetas, etiquetas, carga y riesgos
//   GET    /api/projects/:id/board/events     cambios en vivo por SSE (?token=)
//   GET    /api/projects/:id/activity         historial del tablero
//   GET    /api/projects/:id/archived         tarjetas archivadas
//   POST   /api/projects/:id/lists            crea una lista: { title, stage }
//   PATCH  /api/lists/:id                     renombra, cambia etapa o limite WIP
//   PATCH  /api/lists/:id/move                reordena: { position }
//   DELETE /api/lists/:id?moveTo=<listId>     borra la lista (sus tarjetas pasan a moveTo)
//   GET    /api/projects/:id/labels           etiquetas del proyecto
//   POST   /api/projects/:id/labels           crea etiqueta: { name, color }
//   PATCH  /api/labels/:id                    edita etiqueta
//   DELETE /api/labels/:id                    borra etiqueta

const express = require("express");
const { z } = require("zod");
const db = require("../db");
const bus = require("../orchestrator/bus");
const { asyncHandler } = require("../middleware/errorHandler");
const { requireAuth, requireAuthSse } = require("../middleware/auth");
const { getOwnedProject, getOwnedList, getOwnedLabel } = require("../db/access");
const { teamWorkload } = require("../db/workload");
const { weeksUntil } = require("../planning/workload");
const { validate, conflict } = require("../utils/http");
const board = require("../db/board");

const projectBoardRouter = express.Router();
const listsRouter = express.Router();
const labelsRouter = express.Router();

const serializeList = (l) => ({
  id: l.id,
  title: l.title,
  stage: l.stage,
  position: l.position,
  wipLimit: l.wip_limit,
});
const serializeLabel = (l) => ({ id: l.id, name: l.name, color: l.color });

// ─── Tablero ────────────────────────────────────────────────────────────────
projectBoardRouter.get(
  "/:id/board",
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req.user.id, req.params.id);
    const deadline = project.deadline || project.analysis?.deadline || null;
    const lists = await board.ensureLists(db, project.id);

    const [cards, labels, modules, plan, workload] = await Promise.all([
      db.query(`${board.CARD_SELECT} WHERE k.project_id = $1 AND k.archived_at IS NULL ORDER BY k.position, k.created_at`, [
        project.id,
      ]),
      db.query("SELECT * FROM labels WHERE project_id = $1 ORDER BY name", [project.id]),
      db.query("SELECT id, name, position FROM modules WHERE project_id = $1 ORDER BY position", [project.id]),
      // Riesgos y propuestas del ultimo plan generado para este proyecto.
      db.query(
        `SELECT s.output FROM agent_steps s JOIN runs r ON r.id = s.run_id
         WHERE r.project_id = $1 AND s.agent = 'planner' AND s.status = 'done'
         ORDER BY s.created_at DESC LIMIT 1`,
        [project.id],
      ),
      teamWorkload(project.team_id, weeksUntil(project.start_date, deadline)),
    ]);

    const out = plan.rows[0]?.output;
    res.json({
      ok: true,
      projectId: project.id,
      lists: lists.map((l) => {
        const listCards = cards.rows.filter((c) => c.list_id === l.id).map(board.serializeCard);
        return {
          ...serializeList(l),
          cards: listCards,
          overWipLimit: Boolean(l.wip_limit && listCards.length > l.wip_limit),
        };
      }),
      labels: labels.rows.map(serializeLabel),
      modules: modules.rows,
      workload,
      plan: out
        ? {
            atRisk: out.atRisk,
            finishDate: out.finishDate,
            deadline: out.deadline,
            risks: out.risks,
            proposals: out.proposals,
            explanation: out.explanation,
          }
        : null,
    });
  }),
);

// Cambios en vivo: cada movimiento, comentario o lista nueva llega como evento.
// El frontend puede aplicar el cambio o volver a pedir el tablero.
projectBoardRouter.get(
  "/:id/board/events",
  requireAuthSse,
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req.user.id, req.params.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const write = (event) => {
      const { type, ...data } = event;
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    write({ type: "connected", projectId: project.id });

    const unsubscribe = bus.subscribeBoard(project.id, write);
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }),
);

projectBoardRouter.get(
  "/:id/activity",
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req.user.id, req.params.id);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const { rows } = await db.query(
      `SELECT a.*, u.name AS user_name FROM board_activity a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.project_id = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT $2`,
      [project.id, limit],
    );
    res.json({
      ok: true,
      activity: rows.map((a) => ({
        id: Number(a.id),
        type: a.type,
        message: a.message,
        taskId: a.task_id,
        user: a.user_id ? { id: a.user_id, name: a.user_name } : null,
        data: a.data,
        createdAt: a.created_at,
      })),
    });
  }),
);

projectBoardRouter.get(
  "/:id/archived",
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req.user.id, req.params.id);
    const { rows } = await db.query(
      `${board.CARD_SELECT} WHERE k.project_id = $1 AND k.archived_at IS NOT NULL ORDER BY k.archived_at DESC`,
      [project.id],
    );
    res.json({ ok: true, cards: rows.map(board.serializeCard) });
  }),
);

// ─── Listas ─────────────────────────────────────────────────────────────────
const ListSchema = z.object({
  title: z.string().trim().min(1, "El titulo es obligatorio").max(60),
  stage: z.enum(board.STAGES).default("todo"),
  wipLimit: z.coerce.number().int().positive().max(100).nullable().optional(),
});

const ListPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    stage: z.enum(board.STAGES),
    wipLimit: z.coerce.number().int().positive().max(100).nullable(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "No hay campos para actualizar");

projectBoardRouter.post(
  "/:id/lists",
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req.user.id, req.params.id);
    const body = validate(ListSchema, req.body);
    await board.ensureLists(db, project.id);
    const { rows } = await db.query(
      `INSERT INTO board_lists (project_id, title, stage, position, wip_limit)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position) + 1, 0) FROM board_lists WHERE project_id = $1), $4)
       RETURNING *`,
      [project.id, body.title, body.stage, body.wipLimit ?? null],
    );
    const list = serializeList(rows[0]);
    await board.recordActivity({
      projectId: project.id,
      user: req.user,
      type: "list_created",
      message: `${req.user.name} creó la lista "${list.title}"`,
      data: { listId: list.id },
    });
    res.status(201).json({ ok: true, list });
  }),
);

listsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await getOwnedList(req.user.id, req.params.id);
    const patch = validate(ListPatchSchema, req.body);
    const list = await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE board_lists SET title = $2, stage = $3, wip_limit = $4 WHERE id = $1 RETURNING *`,
        [
          current.id,
          patch.title ?? current.title,
          patch.stage ?? current.stage,
          patch.wipLimit === undefined ? current.wip_limit : patch.wipLimit,
        ],
      );
      // Si cambia la etapa, las tarjetas de la lista cambian con ella.
      if (patch.stage && patch.stage !== current.stage) {
        await client.query("UPDATE tasks SET board_column = $2, updated_at = NOW() WHERE list_id = $1", [
          current.id,
          patch.stage,
        ]);
      }
      return serializeList(rows[0]);
    });
    await board.recordActivity({
      projectId: current.project_id,
      user: req.user,
      type: "list_updated",
      message:
        patch.title && patch.title !== current.title
          ? `${req.user.name} renombró la lista "${current.title}" a "${list.title}"`
          : `${req.user.name} actualizó la lista "${list.title}"`,
      data: { listId: list.id },
    });
    res.json({ ok: true, list });
  }),
);

listsRouter.patch(
  "/:id/move",
  asyncHandler(async (req, res) => {
    const current = await getOwnedList(req.user.id, req.params.id);
    const { position } = validate(z.object({ position: z.coerce.number().int().min(0) }), req.body);
    await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        "SELECT id FROM board_lists WHERE project_id = $1 AND id <> $2 ORDER BY position, created_at FOR UPDATE",
        [current.project_id, current.id],
      );
      const ids = rows.map((r) => r.id);
      ids.splice(Math.min(position, ids.length), 0, current.id);
      await board.renumber(client, "board_lists", ids);
    });
    await board.recordActivity({
      projectId: current.project_id,
      user: req.user,
      type: "list_moved",
      message: `${req.user.name} movió la lista "${current.title}"`,
      data: { listId: current.id, position },
    });
    res.json({ ok: true });
  }),
);

listsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await getOwnedList(req.user.id, req.params.id);
    const moveTo = typeof req.query.moveTo === "string" ? req.query.moveTo : null;

    const moved = await db.withTransaction(async (client) => {
      const { rows: lists } = await client.query(
        "SELECT * FROM board_lists WHERE project_id = $1 ORDER BY position FOR UPDATE",
        [current.project_id],
      );
      if (lists.length <= 1) throw conflict("El tablero necesita al menos una lista");

      const { rows: cards } = await client.query(
        "SELECT id FROM tasks WHERE list_id = $1 ORDER BY position, created_at",
        [current.id],
      );
      if (cards.length > 0) {
        const target = lists.find((l) => l.id === moveTo && l.id !== current.id);
        if (!target) {
          throw conflict(`La lista tiene ${cards.length} tarjeta(s); indica a que lista pasarlas con ?moveTo=<listId>`);
        }
        // Las tarjetas se agregan al final de la lista destino.
        const { rows: max } = await client.query(
          "SELECT COALESCE(MAX(position) + 1, 0) AS next FROM tasks WHERE list_id = $1",
          [target.id],
        );
        for (const [i, c] of cards.entries()) {
          await client.query(
            "UPDATE tasks SET list_id = $2, board_column = $3, position = $4, updated_at = NOW() WHERE id = $1",
            [c.id, target.id, target.stage, max[0].next + i],
          );
        }
      }
      await client.query("DELETE FROM board_lists WHERE id = $1", [current.id]);
      await board.renumber(
        client,
        "board_lists",
        lists.filter((l) => l.id !== current.id).map((l) => l.id),
      );
      return cards.length;
    });
    await board.recordActivity({
      projectId: current.project_id,
      user: req.user,
      type: "list_deleted",
      message: `${req.user.name} borró la lista "${current.title}"${moved ? ` y movio ${moved} tarjeta(s)` : ""}`,
      data: { listId: current.id, movedTo: moved ? moveTo : null },
    });
    res.json({ ok: true, movedCards: moved });
  }),
);

// ─── Etiquetas ──────────────────────────────────────────────────────────────
const LabelSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(40),
  color: z.enum(board.LABEL_COLORS, { message: `Color invalido; usa uno de: ${board.LABEL_COLORS.join(", ")}` }),
});

projectBoardRouter.get(
  "/:id/labels",
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req.user.id, req.params.id);
    const { rows } = await db.query("SELECT * FROM labels WHERE project_id = $1 ORDER BY name", [project.id]);
    res.json({ ok: true, labels: rows.map(serializeLabel), colors: board.LABEL_COLORS });
  }),
);

projectBoardRouter.post(
  "/:id/labels",
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req.user.id, req.params.id);
    const body = validate(LabelSchema, req.body);
    const { rows } = await db.query(
      `INSERT INTO labels (project_id, name, color) VALUES ($1, $2, $3)
       ON CONFLICT (project_id, name) DO NOTHING RETURNING *`,
      [project.id, body.name, body.color],
    );
    if (rows.length === 0) throw conflict("Ya existe una etiqueta con ese nombre");
    await board.recordActivity({
      projectId: project.id,
      user: req.user,
      type: "label_created",
      message: `${req.user.name} creó la etiqueta "${body.name}"`,
      data: { labelId: rows[0].id },
    });
    res.status(201).json({ ok: true, label: serializeLabel(rows[0]) });
  }),
);

labelsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await getOwnedLabel(req.user.id, req.params.id);
    const patch = validate(
      LabelSchema.partial().refine((o) => Object.keys(o).length > 0, "No hay campos para actualizar"),
      req.body,
    );
    let rows;
    try {
      ({ rows } = await db.query("UPDATE labels SET name = $2, color = $3 WHERE id = $1 RETURNING *", [
        current.id,
        patch.name ?? current.name,
        patch.color ?? current.color,
      ]));
    } catch (err) {
      if (err.code === "23505") throw conflict("Ya existe una etiqueta con ese nombre");
      throw err;
    }
    await board.recordActivity({
      projectId: current.project_id,
      user: req.user,
      type: "label_updated",
      message: `${req.user.name} editó la etiqueta "${rows[0].name}"`,
      data: { labelId: current.id },
    });
    res.json({ ok: true, label: serializeLabel(rows[0]) });
  }),
);

labelsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await getOwnedLabel(req.user.id, req.params.id);
    await db.query("DELETE FROM labels WHERE id = $1", [current.id]);
    await board.recordActivity({
      projectId: current.project_id,
      user: req.user,
      type: "label_deleted",
      message: `${req.user.name} borró la etiqueta "${current.name}"`,
      data: { labelId: current.id },
    });
    res.json({ ok: true });
  }),
);

module.exports = { projectBoardRouter, listsRouter, labelsRouter };

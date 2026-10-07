// src/orchestrator/runPipeline.js
//
// Llama a los agentes en orden, guarda cada paso y emite eventos. Cada agente
// es una funcion que recibe un JSON y devuelve otro (mas un resumen).
//
// Estados: queued -> analyzing -> planning -> awaiting_approval ->
//          provisioning -> notifying -> completed (o failed en cualquier paso)

const bus = require("./bus");
const store = require("./store");
const { loadInputFor } = require("./inputs");

const agents = {
  analyst: require("../agents/analyst"),
  planner: require("../agents/planner"),
  devops: require("../agents/devops"),
  notifier: require("../agents/notifier"),
};

/** Contexto que recibe cada agente: progreso en vivo y conteo de tokens. */
function buildContext(runId, projectId, agent) {
  const llm = { models: [], inputTokens: 0, outputTokens: 0 };
  return {
    runId,
    projectId,
    llm,
    recordLlm({ model, usage }) {
      llm.models.push(model);
      llm.inputTokens += usage?.inputTokens || 0;
      llm.outputTokens += usage?.outputTokens || 0;
    },
    progress(message) {
      bus.emit(runId, { type: "progress", agent, message });
    },
  };
}

async function runPipeline(runId, { from = "analyst" } = {}) {
  const run = await store.getRun(runId);
  const requireApproval = run.require_approval;

  for (const step of store.STEPS.slice(store.STEPS.indexOf(from))) {
    if (await store.isCancelled(runId)) return;

    if (step === "approval") {
      if (!requireApproval) continue;
      await store.setStatus(runId, "awaiting_approval", "approval");
      bus.emit(runId, { type: "awaiting_approval" });
      return; // POST /runs/:id/approve vuelve a llamar runPipeline(runId, { from: 'devops' })
    }

    await store.setStatus(runId, store.STATUS_FOR[step], step);
    bus.emit(runId, { type: "step", agent: step, status: "started" });
    const started = Date.now();
    let stepId = null;
    const ctx = buildContext(runId, run.project_id, step);
    try {
      const input = await loadInputFor(runId, step); // sale de la BD: pasos anteriores
      stepId = await store.startStep(runId, step, input);
      const output = await agents[step].run(input, ctx); // JSON entra, JSON sale
      const durationMs = Date.now() - started;
      await store.finishStep(stepId, { status: "done", output, llm: ctx.llm, durationMs });
      bus.emit(runId, {
        type: "step",
        agent: step,
        status: "done",
        summary: output.summary,
        durationMs,
      });
    } catch (err) {
      const durationMs = Date.now() - started;
      console.error(`[pipeline] ${runId} fallo en ${step}: ${err.message}`);
      // Si fallo al armar la entrada todavia no hay fila; se crea para la traza.
      if (!stepId) stepId = await store.startStep(runId, step, null);
      await store.finishStep(stepId, {
        status: "failed",
        output: { error: err.message },
        llm: ctx.llm,
        durationMs,
      });
      await store.failRun(runId, step, err);
      bus.emit(runId, { type: "step", agent: step, status: "failed", error: err.message, durationMs });
      bus.emit(runId, { type: "failed", agent: step, error: err.message });
      return;
    }
  }

  await store.setStatus(runId, "completed");
  const outputs = await store.latestOutputs(runId);
  bus.emit(runId, { type: "completed", links: linksFrom(outputs) });
}

function linksFrom(outputs) {
  return {
    board: outputs.notifier?.links?.board || null,
    repo: outputs.devops?.repoUrl || null,
    zip: outputs.devops?.zipUrl || null,
  };
}

/** Arranca la cadena sin esperar; cualquier error inesperado deja el run en failed. */
function startPipeline(runId, options) {
  runPipeline(runId, options).catch(async (err) => {
    console.error(`[pipeline] Error inesperado en ${runId}:`, err);
    try {
      await store.failRun(runId, "orquestador", err);
      bus.emit(runId, { type: "failed", error: err.message });
    } catch {
      /* la base no responde; no hay mas que hacer */
    }
  });
}

module.exports = { runPipeline, startPipeline, linksFrom };

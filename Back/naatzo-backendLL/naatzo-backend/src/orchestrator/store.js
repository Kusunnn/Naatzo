// src/orchestrator/store.js
// Lecturas y escrituras de runs y agent_steps que usa el orquestador.

const db = require("../db");

// Pasos de la cadena, en orden. "approval" no es un agente: es la pausa.
const STEPS = ["analyst", "planner", "approval", "devops", "notifier"];
const AGENTS = STEPS.filter((s) => s !== "approval");

const STATUS_FOR = {
  analyst: "analyzing",
  planner: "planning",
  devops: "provisioning",
  notifier: "notifying",
};

// Estados en los que la ejecucion sigue viva (no se puede arrancar otra).
const ACTIVE_STATUSES = [
  "queued",
  "analyzing",
  "planning",
  "awaiting_approval",
  "provisioning",
  "notifying",
];
const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];

// El proyecto refleja el estado de su ultima ejecucion.
const PROJECT_STATUS_FOR = {
  awaiting_approval: "awaiting_approval",
  completed: "active",
  failed: "failed",
  cancelled: "draft",
};

async function getRun(runId) {
  const { rows } = await db.query("SELECT * FROM runs WHERE id = $1", [runId]);
  return rows[0] || null;
}

async function setStatus(runId, status, currentStep = null) {
  const terminal = TERMINAL_STATUSES.includes(status);
  const { rows } = await db.query(
    `UPDATE runs SET status = $2,
            current_step = COALESCE($3, current_step),
            finished_at = CASE WHEN $4 THEN NOW() ELSE NULL END
     WHERE id = $1 RETURNING project_id`,
    [runId, status, currentStep, terminal],
  );
  const projectStatus = PROJECT_STATUS_FOR[status] || "running";
  if (rows[0]) {
    await db.query("UPDATE projects SET status = $2, updated_at = NOW() WHERE id = $1", [
      rows[0].project_id,
      projectStatus,
    ]);
  }
}

async function isCancelled(runId) {
  const run = await getRun(runId);
  return !run || run.status === "cancelled";
}

async function startStep(runId, agent, input) {
  const { rows } = await db.query(
    `INSERT INTO agent_steps (run_id, agent, status, input)
     VALUES ($1, $2, 'started', $3) RETURNING id`,
    [runId, agent, JSON.stringify(input)],
  );
  return rows[0].id;
}

async function finishStep(stepId, { status, output, llm, durationMs }) {
  await db.query(
    `UPDATE agent_steps
     SET status = $2, output = $3, model = $4, input_tokens = $5, output_tokens = $6, duration_ms = $7
     WHERE id = $1`,
    [
      stepId,
      status,
      output === undefined ? null : JSON.stringify(output),
      llm.models.length ? [...new Set(llm.models)].join(",") : null,
      llm.inputTokens || null,
      llm.outputTokens || null,
      durationMs,
    ],
  );
}

async function failRun(runId, agent, err) {
  await db.query("UPDATE runs SET error = $2 WHERE id = $1", [
    runId,
    `${agent}: ${err.message}`.slice(0, 2000),
  ]);
  await setStatus(runId, "failed", agent);
}

async function listSteps(runId) {
  const { rows } = await db.query(
    "SELECT * FROM agent_steps WHERE run_id = $1 ORDER BY created_at, id",
    [runId],
  );
  return rows;
}

/** Ultima salida exitosa de cada agente en esta ejecucion: { analyst: {...}, ... } */
async function latestOutputs(runId) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (agent) agent, output FROM agent_steps
     WHERE run_id = $1 AND status = 'done'
     ORDER BY agent, created_at DESC, id DESC`,
    [runId],
  );
  return Object.fromEntries(rows.map((r) => [r.agent, r.output]));
}

/**
 * Al arrancar el servidor, las ejecuciones que estaban a medio paso ya no
 * tienen quien las termine. Se marcan como fallidas para poder reintentarlas.
 * Las que esperan aprobacion se quedan igual.
 */
async function failOrphanRuns() {
  const { rows } = await db.query(
    `UPDATE runs SET status = 'failed', finished_at = NOW(),
            error = 'El servidor se reinicio a mitad de la ejecucion; usa retry'
     WHERE status IN ('queued','analyzing','planning','provisioning','notifying')
     RETURNING id, project_id`,
  );
  for (const r of rows) {
    await db.query("UPDATE projects SET status = 'failed' WHERE id = $1", [r.project_id]);
    await db.query(
      "UPDATE agent_steps SET status = 'failed' WHERE run_id = $1 AND status = 'started'",
      [r.id],
    );
  }
  return rows.length;
}

module.exports = {
  STEPS,
  AGENTS,
  STATUS_FOR,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  getRun,
  setStatus,
  isCancelled,
  startStep,
  finishStep,
  failRun,
  listSteps,
  latestOutputs,
  failOrphanRuns,
};

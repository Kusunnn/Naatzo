// src/agents/notifier.js
//
// Notificador (seccion 5.4). El LLM redacta un resumen de dos o tres lineas;
// los links, numeros y fechas los pone el codigo en una plantilla, para que
// nunca salga un link inventado. Si el LLM falla, el aviso sale igual con la
// plantilla fija. La clave unica evita mandar dos veces el aviso de la misma
// ejecucion si se reintenta este paso.

const env = require("../config/env");
const { generateStructured } = require("../llm/client");
const { NotifySchema, NotifyGemini } = require("../llm/schemas");
const notify = require("../integrations/notify");

const SYSTEM = `Eres el Notificador de Naatzo. Escribes un resumen de 2 o 3 lineas, en espanol y en tono claro,
para avisar al equipo que su proyecto arranco. Usa solo los datos que te dan.
No incluyas links, URLs, fechas ni nombres de repositorio: el sistema los agrega aparte.`;

/** Linea del plan armada por el codigo: tareas, modulos, sobrecarga y propuesta. */
function planLine(plan) {
  let line = `${plan.taskCount} tareas en ${plan.moduleCount} módulos.`;
  for (const o of plan.overloaded) {
    const proposal = plan.proposals.find((p) => p.type === "reasignar" && p.from === o.name);
    line += ` ${o.name} queda al ${o.percent}% de carga`;
    line += proposal ? `; se propone pasar "${proposal.taskTitle}" a ${proposal.to}.` : ".";
  }
  if (plan.deadline && plan.finishDate && plan.finishDate > plan.deadline) {
    line += ` El plan termina el ${plan.finishDate} y la entrega es el ${plan.deadline}.`;
  }
  return line;
}

function buildMessage(input, summary) {
  const lines = [`Proyecto iniciado: ${input.projectName}`, `Tablero: ${input.boardUrl}`];
  lines.push(
    input.repoUrl
      ? `Repositorio: ${input.repoUrl}`
      : "Repositorio: no se creo; el entorno se descarga como ZIP desde el tablero.",
  );
  lines.push(planLine(input.plan));
  if (summary) lines.push(summary);
  if (input.repoUrl) {
    const folder = input.repoUrl.split("/").pop();
    lines.push(`Para levantar el entorno: git clone ${input.repoUrl}.git && cd ${folder} && cp .env.example .env && docker compose up --build`);
  }
  return lines.join("\n");
}

async function run(input, ctx) {
  ctx.progress("Redactando el aviso para el equipo");
  let summary = null;
  try {
    ({ summary } = await generateStructured({
      model: env.LLM_MODEL_FAST,
      system: SYSTEM,
      user: `Datos (JSON):\n${JSON.stringify({ proyecto: input.projectName, objetivo: input.objective, plan: input.plan }, null, 2)}`,
      responseSchema: NotifyGemini,
      zodSchema: NotifySchema,
      temperature: 0.4,
      mockKey: "notifySummary",
      mockInput: { objective: input.objective, plan: input.plan },
      ctx,
    }));
    // Aunque el prompt lo pide, se quitan links por si el modelo escribio alguno.
    summary = summary.replace(/https?:\/\/\S+/gi, "").replace(/\s{2,}/g, " ").trim();
  } catch (err) {
    console.warn(`[notifier] Sin resumen del modelo, se usa la plantilla fija: ${err.message}`);
  }

  const message = buildMessage(input, summary);
  ctx.progress(notify.currentChannel() === "discord" ? "Enviando el aviso por Discord" : "Guardando el aviso");
  const result = await notify.notify({
    projectId: input.projectId,
    type: "inicio",
    message,
    dedupeKey: `inicio:${ctx.runId}`,
  });

  const summaryByStatus = {
    sent: "Aviso enviado por Discord.",
    skipped: "Discord no esta configurado; el aviso quedo en el historial para mostrarlo en pantalla.",
    failed: `No se pudo mandar el aviso: ${result.error}. Quedo en el historial.`,
    duplicate: "El aviso de esta ejecucion ya se habia mandado.",
  };

  return {
    summary: summaryByStatus[result.status],
    channel: result.channel,
    status: result.status,
    error: result.error,
    message,
    links: { board: input.boardUrl, repo: input.repoUrl, zip: input.zipUrl },
  };
}

module.exports = { run, buildMessage, planLine };

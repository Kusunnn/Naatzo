// src/orchestrator/riskAlert.js
//
// Alerta de riesgo del plan. En modo automatico la cadena no se detiene, pero
// si el Planificador detecto riesgos (sobrecarga, entrega imposible, tareas
// sin nadie con la habilidad) se avisa:
//   - evento risk_alert por SSE, para que se vea en pantalla en vivo;
//   - registro en la actividad del tablero;
//   - correo al dueno del equipo con los riesgos y las propuestas.
// En modo supervisado el resumen de riesgo viaja con el aviso de pausa.

const bus = require("./bus");
const board = require("../db/board");
const notify = require("../integrations/notify");
const { boardUrl } = require("./inputs");

/** Resumen de riesgo de la salida del Planificador, o null si el plan esta sano. */
function riskSummary(plan) {
  if (!plan || !plan.atRisk) return null;
  return {
    atRisk: true,
    risks: (plan.risks || []).filter((r) => r.type !== "sin_fecha_entrega"),
    proposals: plan.proposals || [],
    explanation: plan.explanation || null,
    finishDate: plan.finishDate || null,
    deadline: plan.deadline || null,
  };
}

/** Texto del aviso; con `name` empieza con un saludo (correo), sin el queda para el historial. */
function buildMessage(projectName, projectId, risk, name = null) {
  const lines = [
    ...(name ? [`Hola ${name}:`, ""] : []),
    `El Planificador detectó riesgos en el plan de "${projectName}".`,
    "El proyecto está en modo automático, así que siguió sin pausa: el repositorio y los avisos ya se generaron.",
    "",
    "Riesgos:",
    ...risk.risks.map((r) => `- ${r.message}`),
  ];
  if (risk.proposals.length) lines.push("", "Propuestas:", ...risk.proposals.map((p) => `- ${p.message}`));
  if (risk.explanation) lines.push("", risk.explanation);
  lines.push(
    "",
    "Puedes ajustar el plan desde el tablero (cambiar responsables o fechas) o replanificar con una frase,",
    'por ejemplo "Luis ahora tiene 10 horas por semana" o "el cliente nos da una semana más para la entrega".',
    `Tablero: ${boardUrl(projectId)}`,
  );
  return lines.join("\n");
}

/**
 * Avisa del riesgo sin detener la cadena. Nunca lanza: si algo falla, se
 * registra y la ejecucion sigue.
 */
async function raiseRiskAlert(run, project, risk) {
  try {
    bus.emit(run.id, { type: "risk_alert", mode: run.mode, ...risk });
    await board.recordActivity({
      projectId: project.id,
      type: "plan_risk",
      message: `Riesgo detectado en el plan: ${risk.risks.map((r) => r.message).join("; ")} (modo automático: siguió sin pausa)`,
      data: { runId: run.id, risks: risk.risks, proposals: risk.proposals },
    });
    const subject = `[Naatzo] Riesgo en el plan: ${project.name}`;
    const owners = (await notify.teamRecipients(project.id)).filter((r) => r.role === "owner");
    await notify.notify({
      projectId: project.id,
      type: "riesgo_plan",
      subject,
      message: buildMessage(project.name, project.id, risk),
      dedupeKey: `riesgo_plan:${run.id}:${risk.finishDate}:${risk.risks.length}`,
      emails: owners.map((o) => ({ to: o.email, subject, text: buildMessage(project.name, project.id, risk, o.name) })),
    });
  } catch (err) {
    console.error(`[pipeline] No se pudo avisar del riesgo del plan: ${err.message}`);
  }
}

module.exports = { riskSummary, raiseRiskAlert };

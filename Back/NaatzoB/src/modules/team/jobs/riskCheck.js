// src/jobs/riskCheck.js
//
// Revision periodica de tareas en riesgo (seccion 5.4). Todo usa clock.now(),
// que en la demo se puede adelantar con POST /api/team/demo/clock.
//
// Cada alerta lleva una clave unica: tarea:motivo:dia (o miembro:sobrecarga:dia,
// para no mandar un aviso por cada tarea de la misma persona). Las alertas
// nuevas de un proyecto se juntan en un solo correo por persona: el dueno
// recibe todas y cada miembro solo las de sus tareas.

const cron = require("node-cron");
const env = require("../config/env");
const db = require("../db");
const clock = require("../utils/clock");
const notify = require("../integrations/notify");
const { riskReason } = require("../planning/risks");
const { teamWorkload } = require("../db/workload");
const { boardUrl } = require("../orchestrator/inputs");

const REASON_LABEL = {
  vencida: "Vencida",
  vence_en_24h: "Vence en menos de 24 h",
  sin_empezar: "Sin empezar y ya paso la mitad del plazo",
  sobrecarga: "Sobrecarga",
};

/**
 * Revisa los proyectos activos. Con ownerId solo revisa los de ese usuario
 * (cuando la dispara alguien desde la API).
 */
async function checkRisks({ ownerId = null } = {}) {
  const now = clock.now();
  const day = clock.today();
  const { rows: projects } = await db.query(
    `SELECT p.* FROM projects p JOIN teams t ON t.id = p.team_id
     WHERE p.status = 'active' AND ($1::uuid IS NULL OR t.owner_id = $1)`,
    [ownerId],
  );

  const report = { checkedProjects: projects.length, checkedTasks: 0, newAlerts: 0, duplicates: 0, projects: [] };

  for (const project of projects) {
    const deadline = project.deadline || project.analysis?.deadline || null;
    const workload = await teamWorkload(project.team_id, { from: project.start_date, deadline });
    const loadById = new Map(workload.map((w) => [w.memberId, w.percent]));

    const { rows: tasks } = await db.query(
      `SELECT k.*, m.name AS assignee_name FROM tasks k
       LEFT JOIN members m ON m.id = k.assignee_id
       WHERE k.project_id = $1 AND k.board_column <> 'done' AND k.archived_at IS NULL
       ORDER BY k.planned_end NULLS LAST, k.position`,
      [project.id],
    );
    report.checkedTasks += tasks.length;

    const ids = [];
    const alerts = []; // { line, memberId }
    const overloadSeen = new Set(); // una sola alerta de sobrecarga por persona
    for (const task of tasks) {
      const member = task.assignee_id ? { loadPercent: loadById.get(task.assignee_id) || 0 } : null;
      const reason = riskReason(task, now, member);
      if (!reason) continue;

      const isOverload = reason === "sobrecarga";
      if (isOverload) {
        if (overloadSeen.has(task.assignee_id)) continue;
        overloadSeen.add(task.assignee_id);
      }
      const line = isOverload
        ? `- ${REASON_LABEL[reason]}: ${task.assignee_name} esta al ${member.loadPercent}% de carga`
        : `- ${REASON_LABEL[reason]}: "${task.title}" (${task.assignee_name || "sin responsable"}, plan ${task.planned_start} a ${task.planned_end})`;
      const id = await notify.reserve({
        projectId: project.id,
        taskId: isOverload ? null : task.id,
        type: `riesgo_${reason}`,
        message: line.slice(2),
        dedupeKey: isOverload ? `${task.assignee_id}:sobrecarga:${day}` : `${task.id}:${reason}:${day}`,
      });
      if (id) {
        ids.push(id);
        alerts.push({ line, memberId: task.assignee_id });
      } else {
        report.duplicates++;
      }
    }

    if (ids.length === 0) continue;
    const subject = `[Naatzo] Tareas en riesgo: ${project.name}`;
    const recipients = await notify.teamRecipients(project.id);
    const emails = [];
    for (const r of recipients) {
      // El dueno ve todo; cada miembro, solo lo suyo.
      const mine = r.role === "owner" ? alerts : alerts.filter((a) => a.memberId && a.memberId === r.memberId);
      if (mine.length === 0) continue;
      emails.push({ to: r.email, subject, text: buildMessage(project, mine.map((a) => a.line), r.name) });
    }
    const result = await notify.deliver(emails);
    await notify.finish(ids, result);
    report.newAlerts += ids.length;
    report.projects.push({
      projectId: project.id,
      name: project.name,
      alerts: alerts.length,
      status: result.status,
      recipients: result.recipients,
    });
  }
  return report;
}

function buildMessage(project, lines, name) {
  return [
    `Hola ${name}:`,
    "",
    `Tareas en riesgo en ${project.name} (revision del ${clock.today()}):`,
    ...lines,
    "",
    `Tablero: ${boardUrl(project.id)}`,
  ].join("\n");
}

let task = null;

/** Programa la revision con RISK_CHECK_CRON (por defecto cada 10 minutos). */
function startRiskCron() {
  if (!cron.validate(env.RISK_CHECK_CRON)) {
    console.error(`[riesgos] RISK_CHECK_CRON invalido ("${env.RISK_CHECK_CRON}"); no se programa la revision`);
    return;
  }
  task = cron.schedule(env.RISK_CHECK_CRON, async () => {
    try {
      const r = await checkRisks();
      if (r.newAlerts > 0) console.log(`[riesgos] ${r.newAlerts} alerta(s) nueva(s)`);
    } catch (err) {
      console.error(`[riesgos] Fallo la revision: ${err.message}`);
    }
  });
  console.log(`[riesgos] Revision programada: ${env.RISK_CHECK_CRON}`);
}

function stopRiskCron() {
  task?.stop();
}

module.exports = { checkRisks, startRiskCron, stopRiskCron };

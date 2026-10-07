// src/planning/risks.js (sin LLM)
//
// Riesgos del plan y propuestas de reasignacion. El LLM despues solo redacta
// la explicacion; quien pasa a quien lo decide este codigo.

const { PRIORITY_RANK } = require("./topo");

const pct = (m) => Math.round((m.assignedHours / m.capacityHours) * 100);

/**
 * Propone pasar tareas de las personas sobrecargadas a quien tenga espacio.
 * No cambia la asignacion: solo sugiere.
 *
 * @param {Array} tasks    { key, title, skill, estimateHours, priority, assigneeId }
 * @param {Array} members  { id, name, skills, assignedHours, capacityHours }
 */
function proposeReassignments(tasks, members) {
  const sim = members.map((m) => ({ ...m }));
  const proposals = [];

  const overloaded = sim.filter((m) => m.assignedHours > m.capacityHours).sort((a, b) => pct(b) - pct(a));
  for (const over of overloaded) {
    // Primero lo menos prioritario y, entre iguales, lo mas largo.
    const candidates = tasks
      .filter((t) => t.assigneeId === over.id)
      .sort(
        (a, b) =>
          PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.estimateHours - a.estimateHours,
      );

    for (const task of candidates) {
      if (over.assignedHours <= over.capacityHours) break;
      const others = sim.filter((m) => m.id !== over.id);
      const after = (m) => (m.assignedHours + task.estimateHours) / m.capacityHours;
      const skilled = others.filter((m) => m.skills.includes(task.skill) && after(m) <= 1);
      // Sin la habilidad solo se propone a alguien con bastante holgura.
      const anyone = others.filter((m) => after(m) <= 0.8);
      const pool = skilled.length > 0 ? skilled : anyone;
      if (pool.length === 0) continue;

      const target = pool.reduce((best, m) => (after(m) < after(best) ? m : best));
      over.assignedHours -= task.estimateHours;
      target.assignedHours += task.estimateHours;
      proposals.push({
        type: "reasignar",
        taskKey: task.key,
        taskTitle: task.title,
        fromMemberId: over.id,
        from: over.name,
        toMemberId: target.id,
        to: target.name,
        targetHasSkill: skilled.length > 0,
        message:
          `Pasar "${task.title}" de ${over.name} a ${target.name}` +
          (skilled.length > 0 ? "" : ` (no tiene la habilidad ${task.skill})`),
      });
    }

    if (over.assignedHours > over.capacityHours) {
      proposals.push({
        type: "recortar",
        from: over.name,
        message: `Aun con cambios, ${over.name} queda al ${pct(over)}%; conviene recortar o mover la entrega`,
      });
    }
  }
  return proposals;
}

/**
 * Riesgos generales del plan.
 * @returns {{ atRisk: boolean, risks: Array<{type:string, message:string}> }}
 */
function planRisks({ finishDate, deadline, workload, tasks }) {
  const risks = [];
  if (deadline && finishDate && finishDate > deadline) {
    risks.push({
      type: "entrega_imposible",
      message: `El plan termina el ${finishDate} y la entrega es el ${deadline}`,
    });
  }
  if (!deadline) {
    risks.push({ type: "sin_fecha_entrega", message: "No hay fecha de entrega; la carga se mide a 4 semanas" });
  }
  for (const w of workload.filter((w) => w.percent > 100)) {
    risks.push({ type: "sobrecarga", message: `${w.name} queda al ${w.percent}% de carga` });
  }
  const noSkill = tasks.filter((t) => t.flags.includes("sin_habilidad"));
  if (noSkill.length > 0) {
    risks.push({
      type: "sin_habilidad",
      message: `${noSkill.length} tarea(s) sin nadie con la habilidad requerida`,
    });
  }
  if (tasks.some((t) => t.flags.includes("dependencia_ciclica"))) {
    risks.push({ type: "dependencia_ciclica", message: "Se quitaron dependencias que formaban un ciclo" });
  }
  return { atRisk: risks.some((r) => r.type !== "sin_fecha_entrega"), risks };
}

/**
 * Motivo por el que una tarea esta en riesgo, o null (seccion 5.4). Sale de
 * las ventanas de recordatorio de KIBO 1. `now` viene de clock.now().
 */
function riskReason(task, now, member) {
  if (task.board_column === "done") return null;
  if (!task.planned_start || !task.planned_end) return null;
  const start = new Date(`${task.planned_start}T00:00:00`);
  // La tarea vence al final de su ultimo dia planeado.
  const end = new Date(`${task.planned_end}T23:59:59`);
  if (now > end) return "vencida";
  if (end - now <= 24 * 3600e3) return "vence_en_24h";
  if (task.board_column === "todo" && now - start > (end - start) / 2) return "sin_empezar";
  if (member && member.loadPercent > 100) return "sobrecarga";
  return null;
}

module.exports = { proposeReassignments, planRisks, riskReason };

// src/planning/assign.js (sin LLM)
//
// Asignacion por carga. Se recorren las tareas en orden topologico y cada una
// va a la persona con esa habilidad que quede con menor porcentaje de carga.
// La capacidad de cada quien es sus horas por semana por las semanas que
// faltan para la entrega.
//
// Si la minuta menciona a un responsable y esa persona todavia tiene
// capacidad, se respeta; si no, manda la carga.
//
// Para replanificar: lockedAssigneeId deja la tarea con esa persona pase lo
// que pase (ya la esta trabajando), preferredAssigneeId la deja con su
// responsable actual mientras le alcance la capacidad, y excludedAssigneeIds
// la manda con otra persona que tenga la habilidad (si no hay nadie mas, se
// ignora y la tarea espera a su responsable).

const { topoSort, byPriority } = require("./topo");

const sameName = (a, b) =>
  Boolean(a && b) &&
  a.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") ===
    b.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function minBy(list, fn) {
  return list.reduce((best, x) => (fn(x) < fn(best) ? x : best));
}

const loadAfter = (m, hours) => (m.assignedHours + hours) / m.capacityHours;

/**
 * @param {Array} tasks    { key, skill, estimateHours, priority, dependsOn, mentionedOwner, flags }
 * @param {Array} members  { id, name, skills, capacityHours, assignedHours } (assignedHours se modifica)
 * @returns {{ ordered: Array, overloaded: Array }}
 */
function assignTasks(tasks, members) {
  const ordered = topoSort(tasks, { tieBreak: byPriority });
  for (const task of ordered) {
    const excluded = task.excludedAssigneeIds || [];
    const allSkilled = members.filter((m) => m.skills.includes(task.skill));
    const others = allSkilled.filter((m) => !excluded.includes(m.id));
    const skilled = others.length > 0 ? others : allSkilled;
    const pool = skilled.length > 0 ? skilled : members;

    const locked = task.lockedAssigneeId && members.find((m) => m.id === task.lockedAssigneeId);
    const preferred = task.preferredAssigneeId
      ? members.find((m) => m.id === task.preferredAssigneeId)
      : pool.find((m) => sameName(m.name, task.mentionedOwner));
    const chosen =
      locked ||
      (preferred && loadAfter(preferred, task.estimateHours) <= 1
        ? preferred
        : minBy(pool, (m) => loadAfter(m, task.estimateHours)));

    task.assigneeId = chosen.id;
    chosen.assignedHours += task.estimateHours;
    if (skilled.length === 0) task.flags.push("sin_habilidad");
  }
  const overloaded = members.filter((m) => m.assignedHours > m.capacityHours);
  return { ordered, overloaded };
}

module.exports = { assignTasks, sameName };

// src/planning/schedule.js (sin LLM)
//
// Fechas del plan. Se recorre la lista en orden topologico: cada tarea empieza
// cuando terminan sus dependencias y cuando su responsable se desocupa, y dura
// estimateHours / (weeklyHours / 5) dias habiles.
//
// El tiempo se lleva en "dias habiles desde el inicio" con decimales, para que
// dos tareas cortas puedan caer el mismo dia.

const { workdayAt } = require("./dates");

/**
 * @param {Array} ordered  tareas en orden topologico, ya con assigneeId
 * @param {Array} members  { id, weeklyHours, busyHours } (busyHours: horas ya comprometidas antes)
 * @param {string} startDate  AAAA-MM-DD
 * @returns {string|null} fecha en que termina la ultima tarea
 */
function scheduleTasks(ordered, members, startDate) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  // Cada persona arranca libre cuando termina lo que ya tenia de otros proyectos.
  const freeAt = new Map(members.map((m) => [m.id, (m.busyHours || 0) / (m.weeklyHours / 5)]));
  const endAt = new Map();
  let finish = 0;

  for (const task of ordered) {
    const member = memberById.get(task.assigneeId);
    const hoursPerDay = member.weeklyHours / 5;
    const depsEnd = Math.max(0, ...task.dependsOn.map((k) => endAt.get(k) ?? 0));
    const start = Math.max(depsEnd, freeAt.get(member.id));
    // Redondeo para que 2.9999999 no se convierta en un dia extra.
    const end = Math.round((start + task.estimateHours / hoursPerDay) * 1e6) / 1e6;

    freeAt.set(member.id, end);
    endAt.set(task.key, end);
    finish = Math.max(finish, end);

    task.plannedStart = workdayAt(startDate, Math.floor(start));
    // Si termina justo al cerrar un dia, ese es su ultimo dia (no el siguiente).
    task.plannedEnd = workdayAt(startDate, Math.max(Math.ceil(end) - 1, Math.floor(start)));
  }
  return ordered.length ? workdayAt(startDate, Math.max(Math.ceil(finish) - 1, 0)) : null;
}

module.exports = { scheduleTasks };

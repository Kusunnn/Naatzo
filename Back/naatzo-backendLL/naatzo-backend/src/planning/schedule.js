// src/planning/schedule.js (sin LLM)
//
// Fechas del plan. Se recorre la lista en orden topologico: cada tarea empieza
// cuando terminan sus dependencias y cuando su responsable se desocupa, y dura
// estimateHours / (weeklyHours / 5) dias habiles. Los dias en que la persona
// no esta (ausencias) se saltan.
//
// El tiempo se lleva en "dias habiles desde el inicio" con decimales, para que
// dos tareas cortas puedan caer el mismo dia.

const { workdayAt } = require("./dates");

const EPS = 1e-9;

/** Primer momento >= t que no cae en un dia bloqueado. */
function skipBlocked(t, blocked) {
  while (blocked.has(Math.floor(t + EPS))) t = Math.floor(t + EPS) + 1;
  return t;
}

/** Avanza `days` dias de trabajo desde t, sin contar los bloqueados. Regresa el momento final. */
function consume(t, days, blocked) {
  let remaining = days;
  while (remaining > EPS) {
    t = skipBlocked(t, blocked);
    const day = Math.floor(t + EPS);
    const use = Math.min(day + 1 - t, remaining);
    t += use;
    remaining -= use;
  }
  // Redondeo para que 2.9999999 no se convierta en un dia extra.
  return Math.round(t * 1e6) / 1e6;
}

/**
 * @param {Array} ordered  tareas en orden topologico, ya con assigneeId
 * @param {Array} members  { id, weeklyHours, busyHours?, blocked?: Set<number> }
 *                         busyHours: horas ya comprometidas antes; blocked: dias sin trabajar
 * @param {string} startDate  AAAA-MM-DD
 * @returns {string|null} fecha en que termina la ultima tarea
 */
function scheduleTasks(ordered, members, startDate) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const freeAt = new Map();
  // Cada persona arranca libre cuando termina lo que ya tenia comprometido.
  for (const m of members) {
    freeAt.set(m.id, consume(0, (m.busyHours || 0) / (m.weeklyHours / 5), m.blocked || new Set()));
  }
  const endAt = new Map();
  let finish = 0;

  for (const task of ordered) {
    const member = memberById.get(task.assigneeId);
    const blocked = member.blocked || new Set();
    const depsEnd = Math.max(0, ...task.dependsOn.map((k) => endAt.get(k) ?? 0));
    const start = skipBlocked(Math.max(depsEnd, freeAt.get(member.id)), blocked);
    const end = consume(start, task.estimateHours / (member.weeklyHours / 5), blocked);

    freeAt.set(member.id, end);
    endAt.set(task.key, end);
    finish = Math.max(finish, end);

    task.plannedStart = workdayAt(startDate, Math.floor(start + EPS));
    // Si termina justo al cerrar un dia, ese es su ultimo dia (no el siguiente).
    task.plannedEnd = workdayAt(startDate, Math.max(Math.ceil(end - EPS) - 1, Math.floor(start + EPS)));
  }
  return ordered.length ? workdayAt(startDate, Math.max(Math.ceil(finish - EPS) - 1, 0)) : null;
}

module.exports = { scheduleTasks };

// src/planning/workload.js (sin LLM)
// Capacidad y porcentaje de carga por persona.

const { workdaysBetween, maxDate } = require("./dates");
const clock = require("../utils/clock");

// Si no hay fecha de entrega, la capacidad se mide contra este horizonte.
const DEFAULT_WEEKS = 4;

/** Semanas habiles desde `from` (o hoy, lo que sea mas tarde) hasta la entrega. */
function weeksUntil(from, deadline) {
  if (!deadline) return DEFAULT_WEEKS;
  const start = maxDate(from || clock.today(), clock.today());
  // Minimo un dia habil, para no dividir entre cero si la entrega ya paso.
  return Math.max(workdaysBetween(start, deadline), 1) / 5;
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param {Array} members  { id, name, weeklyHours, assignedHours }
 * @param {number} weeks
 */
function workloadRows(members, weeks) {
  return members.map((m) => {
    const capacityHours = round1(m.weeklyHours * weeks);
    const assignedHours = round1(m.assignedHours);
    return {
      memberId: m.id,
      name: m.name,
      weeklyHours: m.weeklyHours,
      assignedHours,
      capacityHours,
      percent: capacityHours > 0 ? Math.round((assignedHours / capacityHours) * 100) : 0,
    };
  });
}

module.exports = { weeksUntil, workloadRows, round1, DEFAULT_WEEKS };

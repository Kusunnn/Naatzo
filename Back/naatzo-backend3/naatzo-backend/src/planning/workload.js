// src/planning/workload.js (sin LLM)
// Capacidad y porcentaje de carga por persona.

const { workdaysBetween, maxDate, nextWorkday } = require("./dates");
const clock = require("../utils/clock");

// Si no hay fecha de entrega, la capacidad se mide contra este horizonte.
const DEFAULT_WEEKS = 4;

/** Primer dia habil desde el que se planea: `from` o hoy, lo que sea mas tarde. */
function planStart(from) {
  return nextWorkday(maxDate(from || clock.today(), clock.today()));
}

/** Semanas habiles desde `from` (o hoy, lo que sea mas tarde) hasta la entrega. */
function weeksUntil(from, deadline) {
  if (!deadline) return DEFAULT_WEEKS;
  const start = maxDate(from || clock.today(), clock.today());
  // Minimo un dia habil, para no dividir entre cero si la entrega ya paso.
  return Math.max(workdaysBetween(start, deadline), 1) / 5;
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Horas que la persona puede trabajar en el horizonte, descontando sus dias de ausencia. */
function capacityOf(member, weeks) {
  const days = Math.max(weeks * 5 - (member.blockedDays || 0), 0);
  return (member.weeklyHours / 5) * days;
}

/**
 * @param {Array} members  { id, name, weeklyHours, assignedHours, blockedDays? }
 * @param {number} weeks
 */
function workloadRows(members, weeks) {
  return members.map((m) => {
    const capacityHours = round1(capacityOf(m, weeks));
    const assignedHours = round1(m.assignedHours);
    return {
      memberId: m.id,
      name: m.name,
      weeklyHours: m.weeklyHours,
      assignedHours,
      capacityHours,
      unavailableDays: m.blockedDays || 0,
      percent: capacityHours > 0 ? Math.round((assignedHours / capacityHours) * 100) : assignedHours > 0 ? 999 : 0,
    };
  });
}

module.exports = { planStart, weeksUntil, workloadRows, capacityOf, round1, DEFAULT_WEEKS };

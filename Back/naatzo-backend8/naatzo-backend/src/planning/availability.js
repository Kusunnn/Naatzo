// src/planning/availability.js (sin LLM)
// Dias habiles bloqueados por ausencias de un miembro.

const { addDays, isWorkday, workdaysBetween, nextWorkday } = require("./dates");

/**
 * Indices de dia habil (0 = startDate) en que la persona no trabaja.
 * @param {string} startDate  AAAA-MM-DD
 * @param {Array<{startDate:string, endDate:string}>} ranges
 */
function blockedDayIndices(startDate, ranges = []) {
  const blocked = new Set();
  const first = nextWorkday(startDate);
  for (const r of ranges) {
    const from = r.startDate > first ? r.startDate : first;
    for (let d = from; d <= r.endDate; d = addDays(d, 1)) {
      if (isWorkday(d)) blocked.add(workdaysBetween(first, d) - 1);
    }
  }
  return blocked;
}

/** Cuantos dias habiles bloqueados caen dentro de los primeros `horizonDays` dias habiles. */
function blockedWithin(blocked, horizonDays) {
  let n = 0;
  for (const i of blocked) if (i < horizonDays) n++;
  return n;
}

/**
 * Prepara a los miembros para asignar y calendarizar: dias bloqueados,
 * capacidad en el horizonte (sin sus ausencias) y horas que ya traen.
 * @param {Array} members  { id, name, skills, weeklyHours, otherProjectsHours?, unavailability? }
 */
function withAvailability(members, startDate, weeks) {
  return members.map((m) => {
    const blocked = blockedDayIndices(startDate, m.unavailability);
    const blockedDays = blockedWithin(blocked, weeks * 5);
    return {
      ...m,
      blocked,
      blockedDays,
      busyHours: m.otherProjectsHours || 0,
      assignedHours: m.otherProjectsHours || 0,
      capacityHours: (m.weeklyHours / 5) * Math.max(weeks * 5 - blockedDays, 0),
    };
  });
}

module.exports = { blockedDayIndices, blockedWithin, withAvailability };

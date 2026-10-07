// src/planning/dates.js
// Fechas como texto "AAAA-MM-DD" y dias habiles (lunes a viernes).
// Se calculan en UTC para que la zona horaria no mueva el dia.

const DAY_MS = 24 * 3600e3;

const toDate = (s) => new Date(`${s}T00:00:00Z`);
const toStr = (d) => d.toISOString().slice(0, 10);

function isWorkday(s) {
  const dow = toDate(s).getUTCDay();
  return dow !== 0 && dow !== 6;
}

function addDays(s, n) {
  return toStr(new Date(toDate(s).getTime() + n * DAY_MS));
}

/** Primer dia habil igual o posterior a la fecha. */
function nextWorkday(s) {
  let d = s;
  while (!isWorkday(d)) d = addDays(d, 1);
  return d;
}

/** Fecha del dia habil numero `index` contando desde `start` (index 0 = start). */
function workdayAt(start, index) {
  let d = nextWorkday(start);
  for (let i = 0; i < index; i++) d = nextWorkday(addDays(d, 1));
  return d;
}

/** Dias habiles entre dos fechas, incluyendo ambas. */
function workdaysBetween(from, to) {
  if (to < from) return 0;
  let count = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkday(d)) count++;
  return count;
}

const maxDate = (a, b) => (a > b ? a : b);

module.exports = { isWorkday, addDays, nextWorkday, workdayAt, workdaysBetween, maxDate };

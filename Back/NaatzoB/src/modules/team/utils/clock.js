// src/utils/clock.js
//
// Reloj del sistema con un desfase que se puede adelantar en la demo
// (POST /api/team/demo/clock). Todo lo que dependa de "ahora" usa clock.now().

let offsetMs = 0;

function now() {
  return new Date(Date.now() + offsetMs);
}

/** Fecha de hoy (segun clock.now) en formato AAAA-MM-DD, hora local del servidor. */
function today() {
  const d = now();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function advance(hours) {
  offsetMs += hours * 3600e3;
}

function reset() {
  offsetMs = 0;
}

function offsetHours() {
  return offsetMs / 3600e3;
}

module.exports = { now, today, advance, reset, offsetHours };

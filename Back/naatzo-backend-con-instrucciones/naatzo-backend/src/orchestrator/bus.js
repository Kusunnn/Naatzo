// src/orchestrator/bus.js
// Bus de eventos en memoria. Las rutas de SSE se suscriben y el orquestador
// (ejecuciones) o el tablero (cambios en tarjetas y listas) emiten.

const { EventEmitter } = require("events");

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

// ─── Ejecuciones ────────────────────────────────────────────────────────────
function emit(runId, event) {
  emitter.emit(runId, { ...event, runId, at: new Date().toISOString() });
}

/** Se suscribe a una ejecucion. Regresa la funcion para desuscribirse. */
function subscribe(runId, listener) {
  emitter.on(runId, listener);
  return () => emitter.off(runId, listener);
}

// ─── Tablero ────────────────────────────────────────────────────────────────
const boardChannel = (projectId) => `board:${projectId}`;

function emitBoard(projectId, event) {
  emitter.emit(boardChannel(projectId), { ...event, projectId, at: new Date().toISOString() });
}

function subscribeBoard(projectId, listener) {
  emitter.on(boardChannel(projectId), listener);
  return () => emitter.off(boardChannel(projectId), listener);
}

module.exports = { emit, subscribe, emitBoard, subscribeBoard };

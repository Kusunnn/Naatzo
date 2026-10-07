// src/planning/topo.js
//
// Orden topologico (algoritmo de Kahn): primero las tareas que no dependen
// de nadie, desempatando por prioridad. Si hay ciclos, se quitan las
// dependencias que los forman y esas tareas quedan marcadas.

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const byPriority = (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.index - b.index;

/**
 * @param {Array<{key:string, priority:string, dependsOn:string[], flags:string[]}>} tasks
 * @returns {Array} las mismas tareas, ordenadas (dependsOn ya sin referencias rotas)
 */
function topoSort(tasks, { tieBreak = byPriority } = {}) {
  const byKey = new Map(tasks.map((t, index) => [t.key, Object.assign(t, { index })]));

  // Dependencias a tareas que no existen o a si misma: se quitan.
  for (const t of tasks) {
    const valid = [...new Set(t.dependsOn)].filter((k) => k !== t.key && byKey.has(k));
    if (valid.length !== t.dependsOn.length) t.flags.push("dependencia_invalida");
    t.dependsOn = valid;
  }

  const ordered = [];
  const done = new Set();
  let pending = [...tasks];

  while (pending.length > 0) {
    const ready = pending.filter((t) => t.dependsOn.every((k) => done.has(k))).sort(tieBreak);
    if (ready.length === 0) {
      // Ciclo: se toma la tarea de mayor prioridad y se le quitan las
      // dependencias que todavia no se cumplen.
      const [breaker] = [...pending].sort(tieBreak);
      breaker.dependsOn = breaker.dependsOn.filter((k) => done.has(k));
      breaker.flags.push("dependencia_ciclica");
      continue;
    }
    // Se toma una a la vez para que el desempate respete la prioridad global.
    const next = ready[0];
    ordered.push(next);
    done.add(next.key);
    pending = pending.filter((t) => t !== next);
  }

  for (const t of ordered) delete t.index;
  return ordered;
}

module.exports = { topoSort, byPriority, PRIORITY_RANK };

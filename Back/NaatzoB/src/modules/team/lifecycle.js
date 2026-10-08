const db = require('./db');
const { failOrphanRuns } = require('./orchestrator/store');
const { startRiskCron, stopRiskCron } = require('./jobs/riskCheck');

async function start() {
  try {
    await db.query('SELECT 1 FROM runs LIMIT 1');
    const orphans = await failOrphanRuns();
    if (orphans) console.warn(`[team] ${orphans} ejecuciones interrumpidas marcadas como failed`);
    startRiskCron();
  } catch (error) {
    console.warn(`[team] No se iniciaron tareas en segundo plano: ${error.message}. Ejecuta npm run migrate:team.`);
  }
}
async function stop() { stopRiskCron(); await db.close(); }
module.exports = { start, stop };

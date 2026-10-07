// src/index.js
// Arranque del servidor. La configuracion se valida primero (config/env).
const env = require("./config/env");
const app = require("./app");
const { failOrphanRuns } = require("./orchestrator/store");
const { startRiskCron } = require("./jobs/riskCheck");

app.listen(env.PORT, async () => {
  console.log(`[naatzo] API escuchando en http://localhost:${env.PORT}`);
  console.log(`[naatzo] LLM: ${env.LLM_MOCK ? "mock" : "gemini"} | demo: ${env.DEMO_MODE}`);

  try {
    const orphans = await failOrphanRuns();
    if (orphans > 0) console.warn(`[naatzo] ${orphans} ejecucion(es) interrumpida(s) quedaron en failed`);
  } catch (err) {
    console.error(`[naatzo] No se pudo revisar la base al arrancar: ${err.message}`);
  }
  startRiskCron();
});

// src/routes/replan.routes.js
//   POST /api/projects/:id/replan   recalcula el plan ante un cambio:
//        { "event": "Ana no puede esta semana", "preview": false }
//        Con preview: true regresa el resultado sin guardar nada.

const express = require("express");
const { z } = require("zod");
const db = require("../db");
const { asyncHandler } = require("../middleware/errorHandler");
const { getProject } = require("../db/access");
const { validate, conflict } = require("../utils/http");
const { ACTIVE_STATUSES } = require("../orchestrator/store");
const { replan } = require("../agents/replan");

const ReplanBody = z.object({
  event: z.string().trim().min(5, "Describe el cambio, por ejemplo: Ana no puede esta semana").max(500),
  preview: z.boolean().default(false),
});

function buildReplanRouter({ aiLimiter }) {
  const router = express.Router();

  router.post(
    "/:id/replan",
    aiLimiter,
    asyncHandler(async (req, res) => {
      const project = await getProject(req.user.id, req.params.id);
      const { event, preview } = validate(ReplanBody, req.body);

      // Con una ejecucion en curso el Planificador todavia puede reescribir el tablero.
      const { rowCount } = await db.query("SELECT 1 FROM runs WHERE project_id = $1 AND status = ANY($2)", [
        project.id,
        ACTIVE_STATUSES.filter((s) => s !== "awaiting_approval"),
      ]);
      if (rowCount) throw conflict("El proyecto tiene una ejecucion en curso; espera a que termine");

      // Fuera del orquestador no hay pasos que registrar; el contexto solo cumple la forma.
      const ctx = { runId: null, recordLlm() {}, progress() {} };
      const result = await replan({ project, event, user: req.user, preview, ctx });
      res.json({ ok: true, ...result });
    }),
  );

  return router;
}

module.exports = { buildReplanRouter };

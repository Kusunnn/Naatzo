// src/routes/health.routes.js
const express = require("express");
const env = require("../config/env");
const db = require("../db");
const email = require("../integrations/email");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ ok: true, service: "naatzo-backend", time: new Date().toISOString() });
});

router.get(
  "/db",
  asyncHandler(async (req, res) => {
    const started = Date.now();
    try {
      await db.query("SELECT 1");
      res.json({ ok: true, db: "conectada", latencyMs: Date.now() - started });
    } catch (err) {
      res.status(503).json({ ok: false, error: `Sin conexion a Postgres: ${err.message}` });
    }
  }),
);

// Que servicios estan configurados, sin mostrar tokens. Sirve como lista de
// revision antes de la demo.
router.get("/integrations", (req, res) => {
  res.json({
    ok: true,
    integrations: {
      llm: {
        mode: env.LLM_MOCK ? "mock" : "gemini",
        fastModel: env.LLM_MODEL_FAST,
        smartModel: env.LLM_MODEL_SMART,
      },
      github: {
        configured: Boolean(env.GITHUB_TOKEN && env.GITHUB_OWNER),
        owner: env.GITHUB_OWNER || null,
        ownerType: env.GITHUB_OWNER_TYPE,
      },
      email: {
        configured: Boolean(env.SMTP_HOST),
        host: env.SMTP_HOST ? `${env.SMTP_HOST}:${env.SMTP_PORT}` : null,
        from: env.SMTP_HOST ? email.sender() : null,
      },
      demoMode: env.DEMO_MODE,
    },
  });
});

module.exports = router;

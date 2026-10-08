// src/app.js
// Arma la app de Express: seguridad, limites y montaje de rutas.
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const env = require("./config/env");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const { teamsRouter, membersRouter } = require("./routes/teams.routes");
const projectsRoutes = require("./routes/projects.routes");
const { buildRunsRouter } = require("./routes/runs.routes");
const { projectBoardRouter, listsRouter, labelsRouter } = require("./routes/board.routes");
const { projectCardsRouter, tasksRouter, checklistRouter, commentsRouter } = require("./routes/tasks.routes");
const environmentRoutes = require("./routes/environment.routes");
const { buildReplanRouter } = require("./routes/replan.routes");
const { memberInvitesRouter, invitationsRouter } = require("./routes/invitations.routes");
const meRoutes = require("./routes/me.routes");
const { projectNotificationsRouter, notificationsRouter } = require("./routes/notifications.routes");
const { requireAuth } = require("./middleware/auth");

const app = express.Router();

// ─── Seguridad base (de KIBO 1) ─────────────────────────────────────────────
app.use(helmet());
// CORS, JSON y trust proxy pertenecen al servidor principal.

// Limite general suave para evitar abuso.
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Demasiadas peticiones, intenta de nuevo" },
});

// Limite mas estricto para lo que dispara llamadas al LLM (POST /runs).
const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: env.AI_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Limite de peticiones a IA alcanzado" },
});

app.use("/", generalLimiter);

// ─── Rutas publicas ─────────────────────────────────────────────────────────
app.use("/health", healthRoutes);
app.use("/auth", authRoutes);

// ─── Rutas con token ────────────────────────────────────────────────────────
// Las ejecuciones van primero: el SSE acepta el token por query, asi que cada
// ruta de este router pone su propio middleware de auth.
app.use("/", buildRunsRouter({ aiLimiter }));
app.use("/projects", environmentRoutes); // el ZIP acepta ?token=
app.use("/projects", projectBoardRouter); // el SSE del tablero acepta ?token=
app.use("/invitations", invitationsRouter); // ver la invitacion es publico; aceptarla pide token
app.use("/teams", requireAuth, teamsRouter);
app.use("/members", requireAuth, membersRouter);
app.use("/members", requireAuth, memberInvitesRouter);
app.use("/me", requireAuth, meRoutes);
app.use('/integrations', requireAuth, require('./routes/integrations.routes'));
app.use("/projects", requireAuth, projectsRoutes);
app.use("/projects", requireAuth, projectCardsRouter);
app.use("/projects", requireAuth, projectNotificationsRouter);
app.use("/projects", requireAuth, buildReplanRouter({ aiLimiter }));
app.use("/lists", requireAuth, listsRouter);
app.use("/labels", requireAuth, labelsRouter);
app.use("/tasks", requireAuth, tasksRouter);
app.use("/checklist", requireAuth, checklistRouter);
app.use("/comments", requireAuth, commentsRouter);
app.use("/notifications", requireAuth, notificationsRouter);

// Las rutas de demo solo existen con DEMO_MODE=true.
if (env.DEMO_MODE) {
  app.use("/demo", requireAuth, require("./routes/demo.routes"));
}

// Raiz: para que abrir http://localhost:4000 en el navegador no parezca un error.
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "naatzo-team",
    message: "Módulo de equipos de NaatzoB; las rutas viven bajo /api/team.",
    health: "/api/team/health",
    docs: "README.md, seccion Endpoints",
  });
});

// ─── 404 + manejador global de errores ──────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

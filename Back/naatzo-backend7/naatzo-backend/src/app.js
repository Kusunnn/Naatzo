// src/app.js
// Arma la app de Express: seguridad, limites y montaje de rutas.
const express = require("express");
const cors = require("cors");
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

const app = express();

// ─── Seguridad base (de KIBO 1) ─────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_LIST.includes("*") ? true : env.CORS_LIST,
    credentials: false,
  }),
);
app.use(express.json({ limit: "2mb" }));

// Si corre detras de un proxy o tunel, confia en el primero para que el
// limite cuente bien la IP real.
app.set("trust proxy", env.TRUST_PROXY);

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

app.use("/api", generalLimiter);

// ─── Rutas publicas ─────────────────────────────────────────────────────────
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);

// ─── Rutas con token ────────────────────────────────────────────────────────
// Las ejecuciones van primero: el SSE acepta el token por query, asi que cada
// ruta de este router pone su propio middleware de auth.
app.use("/api", buildRunsRouter({ aiLimiter }));
app.use("/api/projects", environmentRoutes); // el ZIP acepta ?token=
app.use("/api/projects", projectBoardRouter); // el SSE del tablero acepta ?token=
app.use("/api/invitations", invitationsRouter); // ver la invitacion es publico; aceptarla pide token
app.use("/api/teams", requireAuth, teamsRouter);
app.use("/api/members", requireAuth, membersRouter);
app.use("/api/members", requireAuth, memberInvitesRouter);
app.use("/api/me", requireAuth, meRoutes);
app.use("/api/projects", requireAuth, projectsRoutes);
app.use("/api/projects", requireAuth, projectCardsRouter);
app.use("/api/projects", requireAuth, projectNotificationsRouter);
app.use("/api/projects", requireAuth, buildReplanRouter({ aiLimiter }));
app.use("/api/lists", requireAuth, listsRouter);
app.use("/api/labels", requireAuth, labelsRouter);
app.use("/api/tasks", requireAuth, tasksRouter);
app.use("/api/checklist", requireAuth, checklistRouter);
app.use("/api/comments", requireAuth, commentsRouter);
app.use("/api/notifications", requireAuth, notificationsRouter);

// Las rutas de demo solo existen con DEMO_MODE=true.
if (env.DEMO_MODE) {
  app.use("/api/demo", requireAuth, require("./routes/demo.routes"));
}

// Raiz: para que abrir http://localhost:4000 en el navegador no parezca un error.
app.get(["/", "/api"], (req, res) => {
  res.json({
    ok: true,
    service: "naatzo-backend",
    message: "Naatzo API funcionando. Todas las rutas viven bajo /api; casi todas piden token.",
    health: "/api/health",
    docs: "README.md, seccion Endpoints",
  });
});

// ─── 404 + manejador global de errores ──────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

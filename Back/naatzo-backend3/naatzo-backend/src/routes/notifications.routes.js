// src/routes/notifications.routes.js
//   GET  /api/projects/:id/notifications        historial de avisos
//   POST /api/projects/:id/notifications/test   manda un mensaje de prueba al canal configurado
//   POST /api/notifications/check               fuerza la revision de retrasos (la usan la demo y el cron)

const express = require("express");
const db = require("../db");
const { asyncHandler } = require("../middleware/errorHandler");
const { getProject } = require("../db/access");
const notify = require("../integrations/notify");
const clock = require("../utils/clock");
const { checkRisks } = require("../jobs/riskCheck");

const projectNotificationsRouter = express.Router();
const notificationsRouter = express.Router();

projectNotificationsRouter.get(
  "/:id/notifications",
  asyncHandler(async (req, res) => {
    const project = await getProject(req.user.id, req.params.id, { members: true });
    const { rows } = await db.query(
      `SELECT id, task_id, channel, type, message, status, error, sent_at, created_at
       FROM notifications WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200`,
      [project.id],
    );
    res.json({
      ok: true,
      channel: notify.currentChannel(),
      notifications: rows.map((n) => ({
        id: Number(n.id),
        taskId: n.task_id,
        channel: n.channel,
        type: n.type,
        message: n.message,
        status: n.status,
        error: n.error,
        sentAt: n.sent_at,
        createdAt: n.created_at,
      })),
    });
  }),
);

projectNotificationsRouter.post(
  "/:id/notifications/test",
  asyncHandler(async (req, res) => {
    const project = await getProject(req.user.id, req.params.id);
    const result = await notify.notify({
      projectId: project.id,
      type: "prueba",
      message: `Mensaje de prueba de Naatzo para el proyecto ${project.name} (${clock.now().toISOString()})`,
    });
    res.json({ ok: result.status !== "failed", ...result });
  }),
);

notificationsRouter.post(
  "/check",
  asyncHandler(async (req, res) => {
    const report = await checkRisks({ ownerId: req.user.id });
    res.json({ ok: true, now: clock.now().toISOString(), ...report });
  }),
);

module.exports = { projectNotificationsRouter, notificationsRouter };

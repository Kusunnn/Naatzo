// src/routes/notifications.routes.js
//   GET  /api/projects/:id/notifications        historial de avisos
//   POST /api/projects/:id/notifications/test   manda un correo de prueba a quien lo pide
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
      `SELECT id, task_id, channel, type, subject, message, recipients, status, error, sent_at, created_at
       FROM notifications WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200`,
      [project.id],
    );
    const isOwner = project.access_role === "owner";
    res.json({
      ok: true,
      channel: notify.currentChannel(),
      notifications: rows.map((n) => ({
        id: Number(n.id),
        taskId: n.task_id,
        channel: n.channel,
        type: n.type,
        subject: n.subject,
        message: n.message,
        // Los correos de los demas solo los ve el dueno; los miembros ven cuantos.
        recipients: isOwner ? n.recipients : undefined,
        recipientCount: n.recipients.length,
        status: n.status,
        error: isOwner ? n.error : undefined,
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
    // La prueba solo le llega a quien la pide, para no llenar el correo del equipo.
    const subject = `[Naatzo] Mensaje de prueba: ${project.name}`;
    const message = `Mensaje de prueba de Naatzo para el proyecto ${project.name} (${clock.now().toISOString()}). Si lo lees, el correo funciona.`;
    const result = await notify.notify({
      projectId: project.id,
      type: "prueba",
      subject,
      message,
      emails: [{ to: req.user.email, subject, text: `Hola ${req.user.name}:\n\n${message}` }],
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

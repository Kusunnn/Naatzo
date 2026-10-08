// src/routes/invitations.routes.js
//
// Cuentas para los miembros. El dueno invita a un miembro concreto ("Laura");
// la persona acepta con su cuenta (o se registra con el codigo) y desde ese
// momento entra al tablero del equipo con su propio login.
//
//   POST   /api/team/members/:id/invite          (dueno) crea la invitacion; regresa el codigo y el link
//   DELETE /api/team/members/:id/account         (dueno) desliga la cuenta: el miembro pierde el acceso
//   GET    /api/team/invitations/:code           (publica) a que equipo y como quien te invitan
//   POST   /api/team/invitations/:code/accept    (con token) liga tu cuenta al miembro

const crypto = require("crypto");
const express = require("express");
const db = require("../db");
const env = require("../config/env");
const { asyncHandler } = require("../middleware/errorHandler");
const { requireAuth } = require("../middleware/auth");
const { getMember } = require("../db/access");
const { HttpError, conflict, notFound } = require("../utils/http");
const email = require('../integrations/email');
const { z } = require('zod');

const INVITE_DAYS = 7;

const hashCode = (code) => crypto.createHash("sha256").update(String(code)).digest("hex");

/**
 * Liga la cuenta `userId` al miembro de la invitacion. Va dentro de una
 * transaccion (`client`); tambien la usa el registro con inviteCode.
 */
async function acceptInvitation(client, code, userId) {
  const { rows } = await client.query(
    `SELECT i.*, m.name AS member_name, m.user_id AS member_user_id, m.active, t.name AS team_name
     FROM team_invitations i
     JOIN members m ON m.id = i.member_id
     JOIN teams t ON t.id = i.team_id
     WHERE i.code_hash = $1
     FOR UPDATE OF i, m`,
    [hashCode(code)],
  );
  const inv = rows[0];
  if (!inv) throw notFound("Invitacion no encontrada");
  if (!inv.active) throw notFound('Este integrante ya no está activo');
  const account = (await client.query('SELECT email FROM public.naatzo_users WHERE id = $1', [userId])).rows[0];
  if (!account) throw new HttpError(401, 'Inicia sesión nuevamente');
  if (inv.recipient_email && account.email.toLowerCase() !== inv.recipient_email.toLowerCase()) {
    throw new HttpError(403, 'Esta invitación corresponde a otro correo. Inicia sesión con el correo invitado.');
  }
  if (inv.accepted_at) throw conflict("Esta invitacion ya se uso");
  if (new Date(inv.expires_at) < new Date()) throw new HttpError(410, "La invitacion vencio; pide una nueva");
  if (inv.member_user_id) throw conflict(`${inv.member_name} ya tiene una cuenta ligada`);

  try {
    await client.query("UPDATE members SET user_id = $2 WHERE id = $1", [inv.member_id, userId]);
  } catch (err) {
    if (err.code === "23505") throw conflict("Tu cuenta ya esta ligada a otro miembro de este equipo");
    throw err;
  }
  await client.query("UPDATE team_invitations SET accepted_at = NOW(), accepted_by = $2 WHERE id = $1", [
    inv.id,
    userId,
  ]);
  return { teamId: inv.team_id, teamName: inv.team_name, memberId: inv.member_id, memberName: inv.member_name };
}

// ─── Del dueno, sobre un miembro ────────────────────────────────────────────
const memberInvitesRouter = express.Router();

memberInvitesRouter.post(
  "/:id/invite",
  asyncHandler(async (req, res) => {
    const member = await getMember(req.user.id, req.params.id);
    if (member.user_id) throw conflict(`${member.name} ya tiene una cuenta ligada`);
    if (!member.active) throw conflict('El integrante está desactivado');
    const recipientEmail = String(member.contact?.email || '').trim().toLowerCase();
    if (!z.email().safeParse(recipientEmail).success) throw new HttpError(400, 'Agrega un correo válido al integrante antes de invitarlo');

    const code = crypto.randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 3600e3);
    const invitation = await db.withTransaction(async (client) => {
      // Una invitacion nueva invalida las anteriores de ese miembro.
      await client.query("DELETE FROM team_invitations WHERE member_id = $1 AND accepted_at IS NULL", [member.id]);
      const result = await client.query(
        `INSERT INTO team_invitations (team_id, member_id, code_hash, created_by, expires_at, recipient_email)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [member.team_id, member.id, hashCode(code), req.user.id, expiresAt, recipientEmail],
      );
      return result.rows[0];
    });
    const inviteUrl = `${env.FRONTEND_URL.replace(/\/$/, '')}/invite/${code}`;
    const delivery = { status: 'not_configured', error: 'El envío de correo aún no está configurado. Puedes compartir el enlace.' };
    if (email.isConfigured()) {
      try {
        await email.send({ to: recipientEmail, subject: `${req.user.name} te invita a un equipo en Naatzo`,
          text: `Hola ${member.name}:\n\n${req.user.name} te invita a colaborar en Naatzo.\n\nAcepta con tu cuenta (${recipientEmail}) o regístrate con ese correo:\n${inviteUrl}\n\nEl enlace vence en 7 días. Si no esperabas esta invitación, puedes ignorarla.` });
        delivery.status = 'sent'; delivery.error = null;
      } catch (error) { delivery.status = 'failed'; delivery.error = email.describeError(error); }
    }
    await db.query('UPDATE team_invitations SET delivery_status = $2, delivery_error = $3 WHERE id = $1', [invitation.id, delivery.status, delivery.error]);
    // El codigo solo se muestra aqui; en la base queda su hash.
    res.status(201).json({
      ok: true,
      member: { id: member.id, name: member.name },
      code,
      inviteUrl,
      email: delivery,
      expiresAt,
    });
  }),
);

memberInvitesRouter.delete(
  "/:id/account",
  asyncHandler(async (req, res) => {
    const member = await getMember(req.user.id, req.params.id);
    if (!member.user_id) throw conflict(`${member.name} no tiene una cuenta ligada`);
    await db.query("UPDATE members SET user_id = NULL WHERE id = $1", [member.id]);
    await db.query("DELETE FROM team_invitations WHERE member_id = $1 AND accepted_at IS NULL", [member.id]);
    res.json({ ok: true, message: `${member.name} ya no puede entrar al equipo` });
  }),
);

// ─── De quien recibe la invitacion ──────────────────────────────────────────
const invitationsRouter = express.Router();

invitationsRouter.get(
  "/:code",
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT i.expires_at, i.accepted_at, m.name AS member_name, t.name AS team_name, u.name AS invited_by
       FROM team_invitations i
       JOIN members m ON m.id = i.member_id
       JOIN teams t ON t.id = i.team_id
       LEFT JOIN public.naatzo_users u ON u.id = i.created_by
       WHERE i.code_hash = $1`,
      [hashCode(req.params.code)],
    );
    const inv = rows[0];
    if (!inv) throw notFound("Invitacion no encontrada");
    const status = inv.accepted_at ? "accepted" : new Date(inv.expires_at) < new Date() ? "expired" : "pending";
    res.json({
      ok: true,
      invitation: {
        teamName: inv.team_name,
        memberName: inv.member_name,
        invitedBy: inv.invited_by,
        expiresAt: inv.expires_at,
        status,
      },
    });
  }),
);

invitationsRouter.post(
  "/:code/accept",
  requireAuth,
  asyncHandler(async (req, res) => {
    const joined = await db.withTransaction((client) => acceptInvitation(client, req.params.code, req.user.id));
    res.json({ ok: true, ...joined, message: `Ahora eres ${joined.memberName} en ${joined.teamName}` });
  }),
);

module.exports = { memberInvitesRouter, invitationsRouter, acceptInvitation };

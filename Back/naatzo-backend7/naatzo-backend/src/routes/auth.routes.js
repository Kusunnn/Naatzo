// src/routes/auth.routes.js
//   POST /api/auth/register  crea el usuario y regresa token (con inviteCode, tambien entra al equipo)
//   POST /api/auth/login     regresa { token, user }
//   GET  /api/auth/me        datos del usuario del token y sus equipos (dueno o miembro)

const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const db = require("../db");
const { asyncHandler } = require("../middleware/errorHandler");
const { signToken, requireAuth } = require("../middleware/auth");
const { validate, conflict, HttpError, notFound } = require("../utils/http");
const { acceptInvitation } = require("./invitations.routes");

const router = express.Router();

const RegisterSchema = z.object({
  name: z.string().trim().min(2, "El nombre es muy corto").max(100),
  email: z.string().trim().toLowerCase().email("Correo invalido"),
  password: z.string().min(8, "La contrasena debe tener al menos 8 caracteres").max(200),
  // Codigo de invitacion opcional: la cuenta nueva queda ligada al miembro del equipo.
  inviteCode: z.string().trim().min(10).max(100).optional(),
});

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo invalido"),
  password: z.string().min(1, "La contrasena es obligatoria"),
});

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.created_at });

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, password, inviteCode } = validate(RegisterSchema, req.body);
    const hash = await bcrypt.hash(password, 10);
    // Si la invitacion no sirve, tampoco se crea la cuenta: asi se puede reintentar igual.
    const { user, joined } = await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, name, email, created_at`,
        [name, email, hash],
      );
      if (rows.length === 0) throw conflict("Ya existe una cuenta con ese correo; inicia sesion y acepta la invitacion");
      const joinedTeam = inviteCode ? await acceptInvitation(client, inviteCode, rows[0].id) : null;
      return { user: rows[0], joined: joinedTeam };
    });
    res.status(201).json({ ok: true, token: signToken(user), user: publicUser(user), joined });
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = validate(LoginSchema, req.body);
    const { rows } = await db.query(
      "SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1",
      [email],
    );
    const user = rows[0];
    const valid = user && (await bcrypt.compare(password, user.password_hash));
    if (!valid) throw new HttpError(401, "Correo o contrasena incorrectos");
    res.json({ ok: true, token: signToken(user), user: publicUser(user) });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      "SELECT id, name, email, created_at FROM users WHERE id = $1",
      [req.user.id],
    );
    if (rows.length === 0) throw notFound("Usuario no encontrado");

    // Equipos del usuario: los propios y donde es miembro con cuenta.
    const { rows: links } = await db.query(
      `SELECT t.id AS team_id, t.name AS team_name, 'owner' AS role, NULL::uuid AS member_id, NULL AS member_name
       FROM teams t WHERE t.owner_id = $1
       UNION ALL
       SELECT t.id, t.name, 'member', m.id, m.name
       FROM members m JOIN teams t ON t.id = m.team_id
       WHERE m.user_id = $1 AND m.active`,
      [req.user.id],
    );
    const teams = new Map();
    for (const l of links) {
      const team = teams.get(l.team_id) || { teamId: l.team_id, teamName: l.team_name, role: "member", memberId: null, memberName: null };
      if (l.role === "owner") team.role = "owner";
      if (l.member_id) Object.assign(team, { memberId: l.member_id, memberName: l.member_name });
      teams.set(l.team_id, team);
    }
    res.json({ ok: true, user: publicUser(rows[0]), teams: [...teams.values()] });
  }),
);

module.exports = router;

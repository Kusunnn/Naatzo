// src/routes/teams.routes.js
//   POST   /api/teams               crea un equipo
//   GET    /api/teams               equipos del usuario
//   GET    /api/teams/:id           equipo con miembros y carga actual
//   POST   /api/teams/:id/members   agrega un miembro
//   PATCH  /api/members/:id         cambia disponibilidad o habilidades
//   DELETE /api/members/:id         quita un miembro

const express = require("express");
const { z } = require("zod");
const db = require("../db");
const { asyncHandler } = require("../middleware/errorHandler");
const { getOwnedTeam, getOwnedMember } = require("../db/access");
const { validate } = require("../utils/http");
const serialize = require("../utils/serialize");
const clock = require("../utils/clock");
const { teamWorkload } = require("../db/workload");
const { weeksUntil } = require("../planning/workload");

const teamsRouter = express.Router();
const membersRouter = express.Router();

// Habilidades en minusculas y sin repetir, para comparar con las del Planificador.
const skillsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((list) => [...new Set(list.map((s) => s.toLowerCase()))]);

const contactSchema = z
  .object({
    discord: z.string().trim().max(100).optional(),
    telegram_chat_id: z.string().trim().max(50).optional(),
    email: z.string().trim().email("Correo de contacto invalido").optional(),
  })
  .strict();

const MemberSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  role: z.string().trim().max(100).default(""),
  skills: skillsSchema.default([]),
  weeklyHours: z.coerce.number().positive().max(80).default(20),
  contact: contactSchema.default({}),
});

const MemberPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    role: z.string().trim().max(100),
    skills: skillsSchema,
    weeklyHours: z.coerce.number().positive().max(80),
    contact: contactSchema,
    active: z.boolean(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "No hay campos para actualizar");

const TeamSchema = z.object({
  name: z.string().trim().min(2, "El nombre del equipo es muy corto").max(100),
});

// ─── Equipos ────────────────────────────────────────────────────────────────
teamsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name } = validate(TeamSchema, req.body);
    const { rows } = await db.query(
      "INSERT INTO teams (name, owner_id) VALUES ($1, $2) RETURNING id, name, created_at",
      [name, req.user.id],
    );
    const t = rows[0];
    res.status(201).json({
      ok: true,
      team: { id: t.id, name: t.name, createdAt: t.created_at, members: [] },
    });
  }),
);

teamsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT t.id, t.name, t.created_at,
              (SELECT COUNT(*)::int FROM members m WHERE m.team_id = t.id AND m.active) AS member_count
       FROM teams t WHERE t.owner_id = $1 ORDER BY t.created_at DESC`,
      [req.user.id],
    );
    res.json({
      ok: true,
      teams: rows.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.created_at,
        memberCount: t.member_count,
      })),
    });
  }),
);

teamsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const team = await getOwnedTeam(req.user.id, req.params.id);
    // Carga actual: horas de tareas abiertas (no terminadas) por persona.
    const { rows } = await db.query(
      `SELECT m.*, COALESCE(SUM(k.estimate_hours) FILTER (WHERE k.board_column <> 'done' AND k.archived_at IS NULL), 0) AS open_hours
       FROM members m
       LEFT JOIN tasks k ON k.assignee_id = m.id
       WHERE m.team_id = $1
       GROUP BY m.id
       ORDER BY m.created_at`,
      [team.id],
    );
    res.json({
      ok: true,
      team: {
        id: team.id,
        name: team.name,
        createdAt: team.created_at,
        members: rows.map((m) => ({ ...serialize.member(m), openHours: Number(m.open_hours) })),
      },
    });
  }),
);

teamsRouter.post(
  "/:id/members",
  asyncHandler(async (req, res) => {
    const team = await getOwnedTeam(req.user.id, req.params.id);
    const m = validate(MemberSchema, req.body);
    const { rows } = await db.query(
      `INSERT INTO members (team_id, name, role, skills, weekly_hours, contact)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [team.id, m.name, m.role, m.skills, m.weeklyHours, m.contact],
    );
    res.status(201).json({ ok: true, member: serialize.member(rows[0]) });
  }),
);

// Horas asignadas contra horas disponibles por persona, para la grafica de
// carga. El horizonte va de hoy a la entrega mas lejana de los proyectos del equipo.
teamsRouter.get(
  "/:id/workload",
  asyncHandler(async (req, res) => {
    const team = await getOwnedTeam(req.user.id, req.params.id);
    const { rows } = await db.query(
      `SELECT MAX(COALESCE(deadline, (analysis->>'deadline')::date)) AS deadline
       FROM projects WHERE team_id = $1 AND status <> 'draft'`,
      [team.id],
    );
    const deadline = rows[0].deadline;
    const weeks = weeksUntil(clock.today(), deadline);
    res.json({
      ok: true,
      horizon: { from: clock.today(), to: deadline, weeks: Math.round(weeks * 10) / 10 },
      workload: await teamWorkload(team.id, weeks),
    });
  }),
);

// ─── Miembros ───────────────────────────────────────────────────────────────
membersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await getOwnedMember(req.user.id, req.params.id);
    const patch = validate(MemberPatchSchema, req.body);
    const next = {
      name: patch.name ?? current.name,
      role: patch.role ?? current.role,
      skills: patch.skills ?? current.skills,
      weekly_hours: patch.weeklyHours ?? current.weekly_hours,
      contact: patch.contact ?? current.contact,
      active: patch.active ?? current.active,
    };
    const { rows } = await db.query(
      `UPDATE members SET name = $2, role = $3, skills = $4, weekly_hours = $5, contact = $6, active = $7
       WHERE id = $1 RETURNING *`,
      [current.id, next.name, next.role, next.skills, next.weekly_hours, next.contact, next.active],
    );
    res.json({ ok: true, member: serialize.member(rows[0]) });
  }),
);

membersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await getOwnedMember(req.user.id, req.params.id);
    // Sus tareas quedan sin responsable (ON DELETE SET NULL).
    await db.query("DELETE FROM members WHERE id = $1", [current.id]);
    res.json({ ok: true });
  }),
);

module.exports = { teamsRouter, membersRouter };

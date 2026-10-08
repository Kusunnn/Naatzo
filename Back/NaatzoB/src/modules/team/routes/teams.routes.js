// src/routes/teams.routes.js
//   POST   /api/team/teams               crea un equipo
//   GET    /api/team/teams               equipos del usuario
//   GET    /api/team/teams/:id           equipo con miembros y carga actual
//   POST   /api/team/teams/:id/members   agrega un miembro
//   PATCH  /api/team/members/:id         cambia disponibilidad o habilidades
//   DELETE /api/team/members/:id         quita un miembro
//   POST   /api/team/members/:id/unavailability        registra una ausencia: { startDate, endDate, reason? }
//   DELETE /api/team/members/:id/unavailability/:aid   quita una ausencia

const express = require("express");
const { z } = require("zod");
const db = require("../db");
const { asyncHandler } = require("../middleware/errorHandler");
const { getTeam, getMember, TEAM_VISIBLE } = require("../db/access");
const { validate, requireUuid, notFound, HttpError } = require("../utils/http");
const serialize = require("../utils/serialize");
const clock = require("../utils/clock");
const { teamWorkload, loadUnavailability } = require("../db/workload");
const { weeksUntil } = require("../planning/workload");

const teamsRouter = express.Router();
const membersRouter = express.Router();

// Habilidades en minusculas y sin repetir, para comparar con las del Planificador.
const skillsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((list) => [...new Set(list.map((s) => s.toLowerCase()))]);

// Los avisos salen por correo: el de la cuenta del miembro o, si no tiene, este.
// Otros campos que mande el cliente se ignoran.
const contactSchema = z.object({
  email: z.string().trim().email("Correo de contacto invalido").optional(),
});

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
    // Equipos propios y equipos donde el usuario es miembro con cuenta.
    const { rows } = await db.query(
      `SELECT t.id, t.name, t.created_at,
              CASE WHEN t.owner_id = $1 THEN 'owner' ELSE 'member' END AS role,
              (SELECT COUNT(*)::int FROM members m WHERE m.team_id = t.id AND m.active) AS member_count
       FROM teams t WHERE ${TEAM_VISIBLE} ORDER BY t.created_at DESC`,
      [req.user.id],
    );
    res.json({
      ok: true,
      teams: rows.map((t) => ({
        id: t.id,
        name: t.name,
        role: t.role,
        createdAt: t.created_at,
        memberCount: t.member_count,
      })),
    });
  }),
);

teamsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const team = await getTeam(req.user.id, req.params.id, { members: true });
    // Carga actual: horas de tareas abiertas (no terminadas) por persona.
    const { rows } = await db.query(
      `SELECT m.*, u.email AS account_email,
              COALESCE(SUM(k.estimate_hours) FILTER (WHERE k.board_column <> 'done' AND k.archived_at IS NULL), 0) AS open_hours
       FROM members m
       LEFT JOIN public.naatzo_users u ON u.id = m.user_id
       LEFT JOIN tasks k ON k.assignee_id = m.id
       WHERE m.team_id = $1
       GROUP BY m.id, u.email
       ORDER BY m.created_at, m.name`,
      [team.id],
    );
    const absences = await loadUnavailability(rows.map((m) => m.id));
    const isOwner = team.access_role === "owner";
    res.json({
      ok: true,
      team: {
        id: team.id,
        name: team.name,
        role: team.access_role,
        createdAt: team.created_at,
        members: rows.map((m) => ({
          ...serialize.member(m),
          hasAccount: Boolean(m.user_id),
          isMe: m.user_id === req.user.id,
          // El correo de la cuenta solo lo ve el dueno.
          accountEmail: isOwner ? m.account_email : undefined,
          openHours: Number(m.open_hours),
          unavailability: absences.get(m.id),
        })),
      },
    });
  }),
);

teamsRouter.post(
  "/:id/members",
  asyncHandler(async (req, res) => {
    const team = await getTeam(req.user.id, req.params.id);
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
    const team = await getTeam(req.user.id, req.params.id, { members: true });
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
      workload: await teamWorkload(team.id, { from: clock.today(), deadline }),
    });
  }),
);

// ─── Miembros ───────────────────────────────────────────────────────────────
membersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await getMember(req.user.id, req.params.id);
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
    const current = await getMember(req.user.id, req.params.id);
    // Sus tareas quedan sin responsable (ON DELETE SET NULL).
    await db.query("DELETE FROM members WHERE id = $1", [current.id]);
    res.json({ ok: true });
  }),
);

// ─── Ausencias ──────────────────────────────────────────────────────────────
// Un miembro con cuenta puede registrar sus propias ausencias; el dueno, las de cualquiera.
function requireSelfOrOwner(member, userId) {
  if (member.access_role !== "owner" && member.user_id !== userId) {
    throw new HttpError(403, "Solo puedes registrar o quitar tus propias ausencias");
  }
}

// Tambien las crea POST /projects/:id/replan; aqui se agregan o se quitan a mano.
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD")
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "Fecha inexistente");

const AbsenceSchema = z
  .object({ startDate: isoDate, endDate: isoDate, reason: z.string().trim().max(200).default("") })
  .refine((a) => a.endDate >= a.startDate, { message: "El fin no puede ser antes del inicio", path: ["endDate"] });

membersRouter.post(
  "/:id/unavailability",
  asyncHandler(async (req, res) => {
    const member = await getMember(req.user.id, req.params.id, { members: true });
    requireSelfOrOwner(member, req.user.id);
    const a = validate(AbsenceSchema, req.body);
    const { rows } = await db.query(
      `INSERT INTO member_unavailability (member_id, start_date, end_date, reason)
       VALUES ($1, $2, $3, $4) RETURNING id, start_date, end_date, reason`,
      [member.id, a.startDate, a.endDate, a.reason],
    );
    const r = rows[0];
    res.status(201).json({
      ok: true,
      absence: { id: r.id, startDate: r.start_date, endDate: r.end_date, reason: r.reason },
      message: "Ausencia registrada. Usa POST /projects/:id/replan para recalcular el plan.",
    });
  }),
);

membersRouter.delete(
  "/:id/unavailability/:absenceId",
  asyncHandler(async (req, res) => {
    const member = await getMember(req.user.id, req.params.id, { members: true });
    requireSelfOrOwner(member, req.user.id);
    const { rowCount } = await db.query("DELETE FROM member_unavailability WHERE id = $1 AND member_id = $2", [
      requireUuid(req.params.absenceId, "Ausencia no encontrada"),
      member.id,
    ]);
    if (!rowCount) throw notFound("Ausencia no encontrada");
    res.json({ ok: true });
  }),
);

module.exports = { teamsRouter, membersRouter };

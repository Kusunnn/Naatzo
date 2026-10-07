// src/routes/projects.routes.js
//   POST   /api/projects       crea el proyecto con el texto de la minuta
//   GET    /api/projects       proyectos del usuario
//   GET    /api/projects/:id   detalle: analisis, links, estado y ultima ejecucion
//   DELETE /api/projects/:id   borra el proyecto (el repo de GitHub no se toca)

const express = require("express");
const { z } = require("zod");
const db = require("../db");
const env = require("../config/env");
const { asyncHandler } = require("../middleware/errorHandler");
const { getOwnedTeam, getOwnedProject } = require("../db/access");
const { validate } = require("../utils/http");
const serialize = require("../utils/serialize");
const { ensureLists } = require("../db/board");

const router = express.Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD");

const ProjectSchema = z
  .object({
    teamId: z.string().uuid("teamId invalido"),
    name: z.string().trim().min(2, "El nombre es muy corto").max(120),
    inputText: z
      .string()
      .trim()
      .min(20, "La minuta es muy corta")
      .max(30_000, "La minuta no puede pasar de 30,000 caracteres"),
    startDate: isoDate.optional(),
    deadline: isoDate.optional(),
  })
  .refine((p) => !p.startDate || !p.deadline || p.deadline >= p.startDate, {
    message: "La entrega no puede ser antes del inicio",
    path: ["deadline"],
  });

const boardUrl = (projectId) => `${env.FRONTEND_URL}/p/${projectId}/board`;

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const p = validate(ProjectSchema, req.body);
    const team = await getOwnedTeam(req.user.id, p.teamId);
    const project = await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO projects (team_id, name, input_text, start_date, deadline)
         VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5) RETURNING *`,
        [team.id, p.name, p.inputText, p.startDate ?? null, p.deadline ?? null],
      );
      // El tablero nace con las listas por defecto (Por hacer, En progreso, En revision, Hecho).
      await ensureLists(client, rows[0].id);
      return rows[0];
    });
    res.status(201).json({ ok: true, project: serialize.project(project) });
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT p.*, t.name AS team_name,
              (SELECT COUNT(*)::int FROM tasks k WHERE k.project_id = p.id) AS task_count
       FROM projects p JOIN teams t ON t.id = p.team_id
       WHERE t.owner_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id],
    );
    res.json({
      ok: true,
      projects: rows.map((p) => ({
        ...serialize.project(p),
        analysis: undefined,
        teamName: p.team_name,
        taskCount: p.task_count,
      })),
    });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req.user.id, req.params.id);
    const [runs, counts] = await Promise.all([
      db.query(
        "SELECT * FROM runs WHERE project_id = $1 ORDER BY started_at DESC LIMIT 1",
        [project.id],
      ),
      db.query(
        `SELECT (SELECT COUNT(*)::int FROM tasks WHERE project_id = $1) AS tasks,
                (SELECT COUNT(*)::int FROM modules WHERE project_id = $1) AS modules,
                (SELECT COUNT(*)::int FROM generated_files WHERE project_id = $1) AS files`,
        [project.id],
      ),
    ]);
    res.json({
      ok: true,
      project: {
        ...serialize.project(project),
        inputText: project.input_text,
        boardUrl: boardUrl(project.id),
        counts: counts.rows[0],
        lastRun: runs.rows[0] ? serialize.run(runs.rows[0]) : null,
      },
    });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req.user.id, req.params.id);
    await db.query("DELETE FROM projects WHERE id = $1", [project.id]);
    res.json({ ok: true });
  }),
);

module.exports = router;
module.exports.boardUrl = boardUrl;

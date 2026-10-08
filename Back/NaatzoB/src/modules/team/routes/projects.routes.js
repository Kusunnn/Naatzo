// src/routes/projects.routes.js
//   POST   /api/team/projects                crea el proyecto con la minuta: texto (JSON) o archivo (multipart)
//   POST   /api/team/projects/:id/document   reemplaza la minuta con un PDF, DOCX o TXT (multipart, max 5 MB)
//   GET    /api/team/projects                proyectos del usuario
//   GET    /api/team/projects/:id            detalle: analisis, links, estado y ultima ejecucion
//   DELETE /api/team/projects/:id            borra el proyecto (el repo de GitHub no se toca)

const express = require("express");
const { z } = require("zod");
const db = require("../db");
const env = require("../config/env");
const { asyncHandler } = require("../middleware/errorHandler");
const { getTeam, getProject, TEAM_VISIBLE } = require("../db/access");
const { validate, conflict } = require("../utils/http");
const serialize = require("../utils/serialize");
const { ensureLists } = require("../db/board");
const { receiveFile, extractText, MAX_CHARS } = require("../utils/documents");
const { ACTIVE_STATUSES } = require("../orchestrator/store");
const { combineProjectInput } = require('../utils/projectInput');

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

// La minuta puede llegar pegada (inputText en JSON) o como archivo (campo
// "file" en multipart/form-data, junto con teamId, name, deadline...).
// Si llega archivo, inputText aporta comentarios que complementan su contenido.
router.post(
  "/",
  receiveFile,
  asyncHandler(async (req, res) => {
    const document = req.file ? await extractText(req.file) : null;
    const p = validate(ProjectSchema, {...req.body,inputText:combineProjectInput(document?.text,req.body.inputText)});
    const team = await getTeam(req.user.id, p.teamId);
    const project = await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO projects (team_id, name, input_text, input_filename, start_date, deadline)
         VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6) RETURNING *`,
        [team.id, p.name, p.inputText, document?.filename ?? null, p.startDate ?? null, p.deadline ?? null],
      );
      // El tablero nace con las listas por defecto (Por hacer, En progreso, En revision, Hecho).
      await ensureLists(client, rows[0].id);
      return rows[0];
    });
    res.status(201).json({
      ok: true,
      project: serialize.project(project),
      document: document ? describeDocument(document) : null,
    });
  }),
);

router.post(
  "/:id/document",
  receiveFile,
  asyncHandler(async (req, res) => {
    const project = await getProject(req.user.id, req.params.id);
    const document = await extractText(req.file);
    const inputText=combineProjectInput(document.text,req.body.inputText);

    // Con una ejecucion en curso, cambiar la minuta dejaria el plan a medias.
    const { rowCount } = await db.query("SELECT 1 FROM runs WHERE project_id = $1 AND status = ANY($2)", [
      project.id,
      ACTIVE_STATUSES,
    ]);
    if (rowCount) throw conflict("El proyecto tiene una ejecucion en curso; espera a que termine o cancelala");

    const { rows } = await db.query(
      `UPDATE projects SET input_text = $2, input_filename = $3, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [project.id, inputText, document.filename],
    );
    res.json({
      ok: true,
      project: serialize.project(rows[0]),
      document: describeDocument(document),
      message: "Minuta actualizada. Arranca una nueva ejecucion para analizarla.",
    });
  }),
);

/** Lo que se le regresa al frontend sobre el archivo leido (sin repetir todo el texto). */
function describeDocument(d) {
  return {
    filename: d.filename,
    format: d.format,
    pages: d.pages,
    chars: d.chars,
    truncated: d.truncated,
    warning: d.truncated
      ? `El documento tiene ${d.chars} caracteres; se usan los primeros ${MAX_CHARS}`
      : null,
    preview: d.text.slice(0, 300),
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT p.*, t.name AS team_name,
              CASE WHEN t.owner_id = $1 THEN 'owner' ELSE 'member' END AS role,
              (SELECT COUNT(*)::int FROM tasks k WHERE k.project_id = p.id) AS task_count
       FROM projects p JOIN teams t ON t.id = p.team_id
       WHERE ${TEAM_VISIBLE}
       ORDER BY p.created_at DESC`,
      [req.user.id],
    );
    res.json({
      ok: true,
      projects: rows.map((p) => ({
        ...serialize.project(p),
        analysis: undefined,
        teamName: p.team_name,
        role: p.role,
        taskCount: p.task_count,
      })),
    });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const project = await getProject(req.user.id, req.params.id, { members: true });
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
        role: project.access_role,
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
    const project = await getProject(req.user.id, req.params.id);
    await db.query("DELETE FROM projects WHERE id = $1", [project.id]);
    res.json({ ok: true });
  }),
);

module.exports = router;
module.exports.boardUrl = boardUrl;

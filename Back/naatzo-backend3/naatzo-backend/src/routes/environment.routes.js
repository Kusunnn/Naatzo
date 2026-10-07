// src/routes/environment.routes.js
//   GET /api/projects/:id/environment          archivos generados y URL del repo
//   GET /api/projects/:id/environment/file     contenido de un archivo (?path=docker-compose.yml)
//   GET /api/projects/:id/environment/zip      descarga en ZIP; plan B si GitHub falla
//
// El ZIP acepta el token por query (?token=) para poder bajarlo con un link normal.

const express = require("express");
const { ZipArchive } = require("archiver");
const db = require("../db");
const { asyncHandler } = require("../middleware/errorHandler");
const { requireAuth, requireAuthSse } = require("../middleware/auth");
const { getProject } = require("../db/access");
const { badRequest, notFound } = require("../utils/http");
const { slugify } = require("../templates");
const { zipUrl } = require("../orchestrator/inputs");

const router = express.Router();

router.get(
  "/:id/environment",
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await getProject(req.user.id, req.params.id, { members: true });
    const { rows } = await db.query(
      `SELECT path, octet_length(content) AS bytes FROM generated_files
       WHERE project_id = $1 ORDER BY path`,
      [project.id],
    );
    res.json({
      ok: true,
      repoUrl: project.repo_url,
      zipUrl: rows.length > 0 ? zipUrl(project.id) : null,
      files: rows.map((r) => ({ path: r.path, bytes: Number(r.bytes) })),
    });
  }),
);

router.get(
  "/:id/environment/file",
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await getProject(req.user.id, req.params.id, { members: true });
    const path = typeof req.query.path === "string" ? req.query.path : "";
    if (!path) throw badRequest("Falta el parametro path");
    const { rows } = await db.query("SELECT content FROM generated_files WHERE project_id = $1 AND path = $2", [
      project.id,
      path,
    ]);
    if (rows.length === 0) throw notFound("Archivo no encontrado");
    res.json({ ok: true, path, content: rows[0].content });
  }),
);

router.get(
  "/:id/environment/zip",
  requireAuthSse,
  asyncHandler(async (req, res) => {
    const project = await getProject(req.user.id, req.params.id, { members: true });
    const { rows } = await db.query(
      "SELECT path, content FROM generated_files WHERE project_id = $1 ORDER BY path",
      [project.id],
    );
    if (rows.length === 0) throw notFound("Este proyecto todavia no tiene archivos generados");

    const folder = slugify(project.name);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${folder}.zip"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (err) => {
      console.error(`[zip] ${err.message}`);
      res.destroy(err);
    });
    archive.pipe(res);
    for (const f of rows) archive.append(f.content, { name: `${folder}/${f.path}` });
    await archive.finalize();
  }),
);

module.exports = router;

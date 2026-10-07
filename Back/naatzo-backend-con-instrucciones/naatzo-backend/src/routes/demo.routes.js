// src/routes/demo.routes.js
// Solo se monta si DEMO_MODE=true.
//   POST /api/demo/seed    carga un equipo de 4 personas y una minuta de ejemplo
//   POST /api/demo/clock   adelanta el reloj simulado: { "hours": 48 } (o { "reset": true })
//   POST /api/demo/reset   borra los datos de la demo del usuario y regresa el reloj

const express = require("express");
const { z } = require("zod");
const db = require("../db");
const clock = require("../utils/clock");
const { asyncHandler } = require("../middleware/errorHandler");
const { validate } = require("../utils/http");
const serialize = require("../utils/serialize");
const { ensureLists } = require("../db/board");
const { SAMPLE_TEAM, SAMPLE_MINUTA, SAMPLE_PROJECT_NAME } = require("../demo/sample");

const router = express.Router();

router.post(
  "/seed",
  asyncHandler(async (req, res) => {
    const result = await db.withTransaction(async (client) => {
      const { rows: teams } = await client.query(
        "INSERT INTO teams (name, owner_id, is_demo) VALUES ($1, $2, TRUE) RETURNING id, name",
        [SAMPLE_TEAM.name, req.user.id],
      );
      const team = teams[0];

      const members = [];
      for (const m of SAMPLE_TEAM.members) {
        const { rows } = await client.query(
          `INSERT INTO members (team_id, name, role, skills, weekly_hours, contact)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [team.id, m.name, m.role, m.skills, m.weeklyHours, m.contact || {}],
        );
        members.push(serialize.member(rows[0]));
      }

      // Sin fecha de entrega: la saca el Analista de la minuta.
      const { rows: projects } = await client.query(
        `INSERT INTO projects (team_id, name, input_text, start_date)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [team.id, SAMPLE_PROJECT_NAME, SAMPLE_MINUTA, clock.today()],
      );
      await ensureLists(client, projects[0].id);
      return { team: { ...team, members }, project: serialize.project(projects[0]) };
    });
    res.status(201).json({ ok: true, ...result });
  }),
);

const ClockSchema = z.union([
  z.object({ reset: z.literal(true) }),
  z.object({ hours: z.coerce.number().min(-720).max(720) }),
]);

router.post(
  "/clock",
  asyncHandler(async (req, res) => {
    const body = validate(ClockSchema, req.body);
    if (body.reset) clock.reset();
    else clock.advance(body.hours);
    res.json({ ok: true, now: clock.now().toISOString(), today: clock.today(), offsetHours: clock.offsetHours() });
  }),
);

router.get("/clock", (req, res) => {
  res.json({ ok: true, now: clock.now().toISOString(), today: clock.today(), offsetHours: clock.offsetHours() });
});

router.post(
  "/reset",
  asyncHandler(async (req, res) => {
    // Borra en cascada miembros, proyectos, ejecuciones, tareas y avisos.
    const { rowCount } = await db.query("DELETE FROM teams WHERE owner_id = $1 AND is_demo", [req.user.id]);
    clock.reset();
    res.json({ ok: true, deletedTeams: rowCount, now: clock.now().toISOString() });
  }),
);

module.exports = router;

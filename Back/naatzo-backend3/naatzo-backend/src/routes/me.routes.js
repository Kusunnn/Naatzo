// src/routes/me.routes.js
//   GET /api/me/tasks   tareas abiertas asignadas a mi (en todos los equipos donde soy miembro),
//                       ordenadas por fecha de fin y con el motivo de riesgo si lo hay

const express = require("express");
const db = require("../db");
const clock = require("../utils/clock");
const { asyncHandler } = require("../middleware/errorHandler");
const { riskReason } = require("../planning/risks");
const { num, day } = require("../utils/serialize");

const router = express.Router();

router.get(
  "/tasks",
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT k.id, k.title, k.priority, k.estimate_hours, k.board_column, k.planned_start, k.planned_end,
              bl.title AS list_title, p.id AS project_id, p.name AS project_name,
              t.id AS team_id, t.name AS team_name, m.name AS member_name,
              (SELECT COUNT(*)::int FROM checklist_items c WHERE c.task_id = k.id) AS checklist_total,
              (SELECT COUNT(*)::int FROM checklist_items c WHERE c.task_id = k.id AND c.done) AS checklist_done
       FROM tasks k
       JOIN members m ON m.id = k.assignee_id
       JOIN projects p ON p.id = k.project_id
       JOIN teams t ON t.id = p.team_id
       JOIN board_lists bl ON bl.id = k.list_id
       WHERE m.user_id = $1 AND m.active AND k.archived_at IS NULL AND k.board_column <> 'done'
       ORDER BY k.planned_end NULLS LAST, k.position`,
      [req.user.id],
    );
    const now = clock.now();
    res.json({
      ok: true,
      tasks: rows.map((k) => ({
        id: k.id,
        title: k.title,
        priority: k.priority,
        estimateHours: num(k.estimate_hours),
        stage: k.board_column,
        list: k.list_title,
        plannedStart: day(k.planned_start),
        plannedEnd: day(k.planned_end),
        risk: riskReason(k, now, null),
        checklist: { done: k.checklist_done, total: k.checklist_total },
        project: { id: k.project_id, name: k.project_name },
        team: { id: k.team_id, name: k.team_name },
        as: k.member_name,
      })),
    });
  }),
);

module.exports = router;

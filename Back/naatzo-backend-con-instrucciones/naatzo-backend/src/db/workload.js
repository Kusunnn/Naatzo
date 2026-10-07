// src/db/workload.js
// Carga por persona: horas de tareas abiertas (de todos los proyectos)
// contra su capacidad en un horizonte de semanas.

const db = require("./index");
const { workloadRows } = require("../planning/workload");

async function teamWorkload(teamId, weeks) {
  const { rows } = await db.query(
    `SELECT m.id, m.name, m.weekly_hours,
            COALESCE(SUM(k.estimate_hours) FILTER (WHERE k.board_column <> 'done' AND k.archived_at IS NULL), 0) AS open_hours
     FROM members m
     LEFT JOIN tasks k ON k.assignee_id = m.id
     WHERE m.team_id = $1 AND m.active
     GROUP BY m.id
     ORDER BY m.created_at`,
    [teamId],
  );
  return workloadRows(
    rows.map((m) => ({
      id: m.id,
      name: m.name,
      weeklyHours: Number(m.weekly_hours),
      assignedHours: Number(m.open_hours),
    })),
    weeks,
  );
}

module.exports = { teamWorkload };

// src/db/workload.js
// Carga por persona: horas de tareas abiertas (de todos los proyectos)
// contra su capacidad en el horizonte, descontando sus dias de ausencia.

const db = require("./index");
const { workloadRows, weeksUntil, planStart } = require("../planning/workload");
const { blockedDayIndices, blockedWithin } = require("../planning/availability");

/** Ausencias de varios miembros: Map memberId -> [{ id, startDate, endDate, reason }] */
async function loadUnavailability(memberIds) {
  const byMember = new Map(memberIds.map((id) => [id, []]));
  if (memberIds.length === 0) return byMember;
  const { rows } = await db.query(
    `SELECT id, member_id, start_date, end_date, reason FROM member_unavailability
     WHERE member_id = ANY($1) ORDER BY start_date`,
    [memberIds],
  );
  for (const r of rows) {
    byMember.get(r.member_id).push({ id: r.id, startDate: r.start_date, endDate: r.end_date, reason: r.reason });
  }
  return byMember;
}

/**
 * @param {string} teamId
 * @param {{ from?: string|null, deadline?: string|null }} horizon  inicio y entrega del proyecto
 */
async function teamWorkload(teamId, { from = null, deadline = null } = {}) {
  const weeks = weeksUntil(from, deadline);
  const start = planStart(from);
  const { rows } = await db.query(
    `SELECT m.id, m.name, m.weekly_hours,
            COALESCE(SUM(k.estimate_hours) FILTER (WHERE k.board_column <> 'done' AND k.archived_at IS NULL), 0) AS open_hours
     FROM members m
     LEFT JOIN tasks k ON k.assignee_id = m.id
     WHERE m.team_id = $1 AND m.active
     GROUP BY m.id
     ORDER BY m.created_at, m.name`,
    [teamId],
  );
  const absences = await loadUnavailability(rows.map((m) => m.id));
  return workloadRows(
    rows.map((m) => ({
      id: m.id,
      name: m.name,
      weeklyHours: Number(m.weekly_hours),
      assignedHours: Number(m.open_hours),
      blockedDays: blockedWithin(blockedDayIndices(start, absences.get(m.id)), weeks * 5),
    })),
    weeks,
  );
}

module.exports = { teamWorkload, loadUnavailability };

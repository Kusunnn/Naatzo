// src/db/board.js
//
// Piezas compartidas del tablero propio (estilo Trello): listas por defecto,
// consulta y forma de las tarjetas, y registro de actividad. Cada actividad
// tambien se emite por el bus para que los tableros abiertos se actualicen.

const db = require("./index");
const bus = require("../orchestrator/bus");
const { num, day } = require("../utils/serialize");

const STAGES = ["todo", "in_progress", "review", "done"];

const DEFAULT_LISTS = [
  { title: "Por hacer", stage: "todo" },
  { title: "En progreso", stage: "in_progress" },
  { title: "En revisión", stage: "review" },
  { title: "Hecho", stage: "done" },
];

const LABEL_COLORS = ["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "black"];

/** Listas del proyecto en orden. Si no tiene, crea las de por defecto. `q` puede ser un client de transaccion. */
async function ensureLists(q, projectId) {
  const { rows } = await q.query("SELECT * FROM board_lists WHERE project_id = $1 ORDER BY position, created_at", [
    projectId,
  ]);
  if (rows.length > 0) return rows;
  const created = [];
  for (const [position, l] of DEFAULT_LISTS.entries()) {
    const { rows: r } = await q.query(
      "INSERT INTO board_lists (project_id, title, stage, position) VALUES ($1, $2, $3, $4) RETURNING *",
      [projectId, l.title, l.stage, position],
    );
    created.push(r[0]);
  }
  return created;
}

/** Lista donde entran las tarjetas nuevas: la primera de etapa "todo", o la primera. */
function entryList(lists) {
  return lists.find((l) => l.stage === "todo") || lists[0];
}

const CARD_SELECT = `
  SELECT k.*, md.name AS module_name, mb.name AS assignee_name, bl.title AS list_title,
         COALESCE(ARRAY(SELECT d.depends_on_id FROM task_dependencies d WHERE d.task_id = k.id), '{}') AS depends_on,
         COALESCE((SELECT json_agg(json_build_object('id', lb.id, 'name', lb.name, 'color', lb.color) ORDER BY lb.name)
                   FROM task_labels tl JOIN labels lb ON lb.id = tl.label_id
                   WHERE tl.task_id = k.id), '[]') AS labels,
         (SELECT COUNT(*)::int FROM checklist_items c WHERE c.task_id = k.id) AS checklist_total,
         (SELECT COUNT(*)::int FROM checklist_items c WHERE c.task_id = k.id AND c.done) AS checklist_done,
         (SELECT COUNT(*)::int FROM task_comments c WHERE c.task_id = k.id) AS comment_count
  FROM tasks k
  JOIN board_lists bl ON bl.id = k.list_id
  LEFT JOIN modules md ON md.id = k.module_id
  LEFT JOIN members mb ON mb.id = k.assignee_id`;

function serializeCard(t) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    list: { id: t.list_id, title: t.list_title },
    stage: t.board_column,
    position: t.position,
    module: t.module_id ? { id: t.module_id, name: t.module_name } : null,
    skill: t.skill,
    assignee: t.assignee_id ? { id: t.assignee_id, name: t.assignee_name } : null,
    estimateHours: num(t.estimate_hours),
    priority: t.priority,
    plannedStart: day(t.planned_start),
    plannedEnd: day(t.planned_end),
    dependsOn: t.depends_on || [],
    flags: t.flags,
    labels: t.labels || [],
    checklist: { done: t.checklist_done, total: t.checklist_total },
    commentCount: t.comment_count,
    archived: Boolean(t.archived_at),
    updatedAt: t.updated_at,
  };
}

async function loadCard(taskId) {
  const { rows } = await db.query(`${CARD_SELECT} WHERE k.id = $1`, [taskId]);
  return rows[0] ? serializeCard(rows[0]) : null;
}

/**
 * Guarda un movimiento en el historial y lo avisa a los tableros abiertos.
 * Se llama despues de que el cambio ya quedo guardado.
 */
async function recordActivity({ projectId, taskId = null, user = null, type, message, data = {} }) {
  const { rows } = await db.query(
    `INSERT INTO board_activity (project_id, task_id, user_id, type, message, data)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
    [projectId, taskId, user?.id || null, type, message, data],
  );
  bus.emitBoard(projectId, { type, taskId, message, data, activityId: Number(rows[0].id) });
}

/** Renumera las posiciones (0, 1, 2...) en el orden dado. */
async function renumber(client, table, ids) {
  for (const [i, id] of ids.entries()) {
    await client.query(`UPDATE ${table} SET position = $2 WHERE id = $1`, [id, i]);
  }
}

module.exports = {
  STAGES,
  DEFAULT_LISTS,
  LABEL_COLORS,
  ensureLists,
  entryList,
  CARD_SELECT,
  serializeCard,
  loadCard,
  recordActivity,
  renumber,
};

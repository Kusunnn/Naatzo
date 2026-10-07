// src/db/access.js
//
// Busquedas que siempre filtran por el usuario del token. Al equipo entran:
//   - el dueno (teams.owner_id): puede todo;
//   - los miembros con cuenta (members.user_id): solo donde la ruta lo permite
//     con { members: true } (ver el tablero, trabajar tarjetas, comentar...).
// Por defecto solo pasa el dueno. Si el recurso no existe o es de un equipo
// ajeno se responde 404 (igual en ambos casos, para no revelar que existe);
// si es del equipo pero la accion es solo del dueno, 403.

const db = require("./index");
const { notFound, requireUuid, HttpError } = require("../utils/http");

// $2 siempre es el id del usuario.
const ACCESS = `(t.owner_id = $2 OR EXISTS (
  SELECT 1 FROM members mm WHERE mm.team_id = t.id AND mm.user_id = $2 AND mm.active))`;
const ROLE = `CASE WHEN t.owner_id = $2 THEN 'owner' ELSE 'member' END AS access_role`;

const ownerOnly = () => new HttpError(403, "Solo el dueño del equipo puede hacer esto");

async function find(sql, params, message, { members = false } = {}) {
  const { rows } = await db.query(sql, params);
  if (rows.length === 0) throw notFound(message);
  if (rows[0].access_role !== "owner" && !members) throw ownerOnly();
  return rows[0];
}

function getTeam(userId, teamId, opts) {
  requireUuid(teamId, "Equipo no encontrado");
  return find(`SELECT t.*, ${ROLE} FROM teams t WHERE t.id = $1 AND ${ACCESS}`, [teamId, userId], "Equipo no encontrado", opts);
}

function getMember(userId, memberId, opts) {
  requireUuid(memberId, "Miembro no encontrado");
  return find(
    `SELECT m.*, ${ROLE} FROM members m JOIN teams t ON t.id = m.team_id
     WHERE m.id = $1 AND ${ACCESS}`,
    [memberId, userId],
    "Miembro no encontrado",
    opts,
  );
}

function getProject(userId, projectId, opts) {
  requireUuid(projectId, "Proyecto no encontrado");
  return find(
    `SELECT p.*, ${ROLE} FROM projects p JOIN teams t ON t.id = p.team_id
     WHERE p.id = $1 AND ${ACCESS}`,
    [projectId, userId],
    "Proyecto no encontrado",
    opts,
  );
}

function getRun(userId, runId, opts) {
  requireUuid(runId, "Ejecucion no encontrada");
  return find(
    `SELECT r.*, ${ROLE} FROM runs r
     JOIN projects p ON p.id = r.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE r.id = $1 AND ${ACCESS}`,
    [runId, userId],
    "Ejecucion no encontrada",
    opts,
  );
}

function getTask(userId, taskId, opts) {
  requireUuid(taskId, "Tarea no encontrada");
  return find(
    `SELECT k.*, p.team_id, ${ROLE} FROM tasks k
     JOIN projects p ON p.id = k.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE k.id = $1 AND ${ACCESS}`,
    [taskId, userId],
    "Tarea no encontrada",
    opts,
  );
}

function getList(userId, listId, opts) {
  requireUuid(listId, "Lista no encontrada");
  return find(
    `SELECT l.*, ${ROLE} FROM board_lists l
     JOIN projects p ON p.id = l.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE l.id = $1 AND ${ACCESS}`,
    [listId, userId],
    "Lista no encontrada",
    opts,
  );
}

function getLabel(userId, labelId, opts) {
  requireUuid(labelId, "Etiqueta no encontrada");
  return find(
    `SELECT lb.*, ${ROLE} FROM labels lb
     JOIN projects p ON p.id = lb.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE lb.id = $1 AND ${ACCESS}`,
    [labelId, userId],
    "Etiqueta no encontrada",
    opts,
  );
}

function getChecklistItem(userId, itemId, opts) {
  requireUuid(itemId, "Elemento no encontrado");
  return find(
    `SELECT c.*, k.project_id, k.title AS task_title, ${ROLE} FROM checklist_items c
     JOIN tasks k ON k.id = c.task_id
     JOIN projects p ON p.id = k.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE c.id = $1 AND ${ACCESS}`,
    [itemId, userId],
    "Elemento no encontrado",
    opts,
  );
}

function getComment(userId, commentId, opts) {
  requireUuid(commentId, "Comentario no encontrado");
  return find(
    `SELECT c.*, k.project_id, ${ROLE} FROM task_comments c
     JOIN tasks k ON k.id = c.task_id
     JOIN projects p ON p.id = k.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE c.id = $1 AND ${ACCESS}`,
    [commentId, userId],
    "Comentario no encontrado",
    opts,
  );
}

/** Condicion SQL para listados: equipos donde el usuario ($1) es dueno o miembro con cuenta. */
const TEAM_VISIBLE = `(t.owner_id = $1 OR EXISTS (
  SELECT 1 FROM members mm WHERE mm.team_id = t.id AND mm.user_id = $1 AND mm.active))`;

module.exports = {
  getTeam,
  getMember,
  getProject,
  getRun,
  getTask,
  getList,
  getLabel,
  getChecklistItem,
  getComment,
  ownerOnly,
  TEAM_VISIBLE,
};

// src/db/access.js
//
// Busquedas que siempre filtran por el dueno (usuario del token). Si el
// recurso no existe o es de otra persona se responde 404, igual en ambos
// casos para no revelar que existe.

const db = require("./index");
const { notFound, requireUuid } = require("../utils/http");

async function one(sql, params, message) {
  const { rows } = await db.query(sql, params);
  if (rows.length === 0) throw notFound(message);
  return rows[0];
}

function getOwnedTeam(userId, teamId) {
  requireUuid(teamId, "Equipo no encontrado");
  return one("SELECT * FROM teams WHERE id = $1 AND owner_id = $2", [teamId, userId], "Equipo no encontrado");
}

function getOwnedMember(userId, memberId) {
  requireUuid(memberId, "Miembro no encontrado");
  return one(
    `SELECT m.* FROM members m JOIN teams t ON t.id = m.team_id
     WHERE m.id = $1 AND t.owner_id = $2`,
    [memberId, userId],
    "Miembro no encontrado",
  );
}

function getOwnedProject(userId, projectId) {
  requireUuid(projectId, "Proyecto no encontrado");
  return one(
    `SELECT p.* FROM projects p JOIN teams t ON t.id = p.team_id
     WHERE p.id = $1 AND t.owner_id = $2`,
    [projectId, userId],
    "Proyecto no encontrado",
  );
}

function getOwnedRun(userId, runId) {
  requireUuid(runId, "Ejecucion no encontrada");
  return one(
    `SELECT r.* FROM runs r
     JOIN projects p ON p.id = r.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE r.id = $1 AND t.owner_id = $2`,
    [runId, userId],
    "Ejecucion no encontrada",
  );
}

function getOwnedTask(userId, taskId) {
  requireUuid(taskId, "Tarea no encontrada");
  return one(
    `SELECT k.*, p.team_id FROM tasks k
     JOIN projects p ON p.id = k.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE k.id = $1 AND t.owner_id = $2`,
    [taskId, userId],
    "Tarea no encontrada",
  );
}

function getOwnedList(userId, listId) {
  requireUuid(listId, "Lista no encontrada");
  return one(
    `SELECT l.* FROM board_lists l
     JOIN projects p ON p.id = l.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE l.id = $1 AND t.owner_id = $2`,
    [listId, userId],
    "Lista no encontrada",
  );
}

function getOwnedLabel(userId, labelId) {
  requireUuid(labelId, "Etiqueta no encontrada");
  return one(
    `SELECT lb.* FROM labels lb
     JOIN projects p ON p.id = lb.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE lb.id = $1 AND t.owner_id = $2`,
    [labelId, userId],
    "Etiqueta no encontrada",
  );
}

function getOwnedChecklistItem(userId, itemId) {
  requireUuid(itemId, "Elemento no encontrado");
  return one(
    `SELECT c.*, k.project_id, k.title AS task_title FROM checklist_items c
     JOIN tasks k ON k.id = c.task_id
     JOIN projects p ON p.id = k.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE c.id = $1 AND t.owner_id = $2`,
    [itemId, userId],
    "Elemento no encontrado",
  );
}

function getOwnedComment(userId, commentId) {
  requireUuid(commentId, "Comentario no encontrado");
  return one(
    `SELECT c.*, k.project_id FROM task_comments c
     JOIN tasks k ON k.id = c.task_id
     JOIN projects p ON p.id = k.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE c.id = $1 AND t.owner_id = $2`,
    [commentId, userId],
    "Comentario no encontrado",
  );
}

module.exports = {
  getOwnedTeam,
  getOwnedMember,
  getOwnedProject,
  getOwnedRun,
  getOwnedTask,
  getOwnedList,
  getOwnedLabel,
  getOwnedChecklistItem,
  getOwnedComment,
};

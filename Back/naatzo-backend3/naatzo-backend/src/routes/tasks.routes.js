// src/routes/tasks.routes.js
//
// Tarjetas del tablero propio (las tareas del plan).
//   POST   /api/projects/:id/tasks      agrega una tarjeta: { title, listId?, ... }
//   GET    /api/tasks/:id               detalle: checklist, comentarios, dependencias y actividad
//   PATCH  /api/tasks/:id               edita responsable, estimacion, prioridad, fechas...
//   PATCH  /api/tasks/:id/move          mueve: { "listId": "...", "position": 2 } (o { "column": "in_progress" })
//   POST   /api/tasks/:id/archive       archiva la tarjeta
//   POST   /api/tasks/:id/restore       la regresa al final de su lista
//   DELETE /api/tasks/:id               borra la tarjeta
//   PUT    /api/tasks/:id/labels        etiquetas de la tarjeta: { labelIds: [...] }
//   POST   /api/tasks/:id/checklist     agrega un elemento: { text }
//   PATCH  /api/checklist/:id           { text?, done?, position? }
//   DELETE /api/checklist/:id
//   POST   /api/tasks/:id/comments      comenta: { body }
//   PATCH  /api/comments/:id            edita tu comentario
//   DELETE /api/comments/:id            borra tu comentario

const express = require("express");
const { z } = require("zod");
const db = require("../db");
const { asyncHandler } = require("../middleware/errorHandler");
const {
  getProject,
  getTask,
  getChecklistItem,
  getComment,
} = require("../db/access");
const { validate, badRequest, conflict, HttpError } = require("../utils/http");
const { day } = require("../utils/serialize");
const board = require("../db/board");

const projectCardsRouter = express.Router();
const tasksRouter = express.Router();
const checklistRouter = express.Router();
const commentsRouter = express.Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD");

const TaskFields = {
  title: z.string().trim().min(2, "El titulo es muy corto").max(140),
  description: z.string().trim().max(5000),
  moduleId: z.string().uuid().nullable(),
  skill: z
    .string()
    .trim()
    .max(40)
    .transform((s) => s.toLowerCase())
    .nullable(),
  assigneeId: z.string().uuid().nullable(),
  priority: z.enum(["high", "medium", "low"]),
  estimateHours: z.coerce.number().positive().max(40).nullable(),
  plannedStart: isoDate.nullable(),
  plannedEnd: isoDate.nullable(),
  dependsOn: z.array(z.string().uuid()).max(30),
};

const CreateSchema = z
  .object(TaskFields)
  .partial()
  .extend({
    title: TaskFields.title,
    listId: z.string().uuid().optional(),
    description: TaskFields.description.default(""),
    priority: TaskFields.priority.default("medium"),
    dependsOn: TaskFields.dependsOn.default([]),
  });

const PatchSchema = z
  .object(TaskFields)
  .partial()
  .refine((o) => Object.keys(o).length > 0, "No hay campos para actualizar");

const MoveSchema = z
  .object({
    listId: z.string().uuid().optional(),
    column: z.enum(board.STAGES).optional(),
    position: z.coerce.number().int().min(0).default(0),
  })
  .refine((o) => o.listId || o.column, "Indica listId (o column)");

const PATCH_COLUMNS = {
  title: "title",
  description: "description",
  moduleId: "module_id",
  skill: "skill",
  assigneeId: "assignee_id",
  priority: "priority",
  estimateHours: "estimate_hours",
  plannedStart: "planned_start",
  plannedEnd: "planned_end",
};

/** Revisa que modulo, responsable y dependencias sean de este proyecto/equipo. */
async function checkRefs(project, body, taskId = null) {
  if (body.moduleId) {
    const { rowCount } = await db.query("SELECT 1 FROM modules WHERE id = $1 AND project_id = $2", [
      body.moduleId,
      project.id,
    ]);
    if (!rowCount) throw badRequest("El modulo no es de este proyecto");
  }
  if (body.assigneeId) {
    const { rowCount } = await db.query("SELECT 1 FROM members WHERE id = $1 AND team_id = $2", [
      body.assigneeId,
      project.team_id,
    ]);
    if (!rowCount) throw badRequest("El responsable no es miembro del equipo");
  }
  if (body.dependsOn && body.dependsOn.length > 0) {
    const deps = [...new Set(body.dependsOn)];
    if (taskId && deps.includes(taskId)) throw badRequest("Una tarea no puede depender de si misma");
    const { rows } = await db.query("SELECT id FROM tasks WHERE id = ANY($1) AND project_id = $2", [
      deps,
      project.id,
    ]);
    if (rows.length !== deps.length) throw badRequest("Alguna dependencia no es de este proyecto");
    if (taskId) {
      // Si alguna dependencia ya depende (directa o indirectamente) de esta tarea, habria ciclo.
      const { rowCount } = await db.query(
        `WITH RECURSIVE chain AS (
           SELECT depends_on_id FROM task_dependencies WHERE task_id = ANY($1)
           UNION
           SELECT d.depends_on_id FROM task_dependencies d JOIN chain c ON d.task_id = c.depends_on_id
         )
         SELECT 1 FROM chain WHERE depends_on_id = $2`,
        [deps, taskId],
      );
      if (rowCount) throw badRequest("Esas dependencias formarian un ciclo");
    }
  }
  if (body.plannedStart && body.plannedEnd && body.plannedEnd < body.plannedStart) {
    throw badRequest("La fecha de fin no puede ser antes del inicio");
  }
}

async function replaceDependencies(client, taskId, deps) {
  await client.query("DELETE FROM task_dependencies WHERE task_id = $1", [taskId]);
  for (const dep of new Set(deps)) {
    await client.query("INSERT INTO task_dependencies (task_id, depends_on_id) VALUES ($1, $2)", [taskId, dep]);
  }
}

/** Ids de las tarjetas visibles de una lista, en orden, sin `exceptId`. */
async function cardIdsIn(client, listId, exceptId = null) {
  const { rows } = await client.query(
    `SELECT id FROM tasks WHERE list_id = $1 AND archived_at IS NULL AND id IS DISTINCT FROM $2
     ORDER BY position, created_at`,
    [listId, exceptId],
  );
  return rows.map((r) => r.id);
}

// ─── Crear ──────────────────────────────────────────────────────────────────
projectCardsRouter.post(
  "/:id/tasks",
  asyncHandler(async (req, res) => {
    const project = await getProject(req.user.id, req.params.id, { members: true });
    const body = validate(CreateSchema, req.body);
    await checkRefs(project, body);

    const { id, list } = await db.withTransaction(async (client) => {
      const lists = await board.ensureLists(client, project.id);
      const target = body.listId ? lists.find((l) => l.id === body.listId) : board.entryList(lists);
      if (!target) throw badRequest("La lista no es de este proyecto");
      const { rows } = await client.query(
        `INSERT INTO tasks (project_id, list_id, board_column, position, module_id, title, description, skill,
                            assignee_id, priority, estimate_hours, planned_start, planned_end)
         VALUES ($1, $2, $3,
                 (SELECT COALESCE(MAX(position) + 1, 0) FROM tasks WHERE list_id = $2 AND archived_at IS NULL),
                 $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          project.id,
          target.id,
          target.stage,
          body.moduleId ?? null,
          body.title,
          body.description,
          body.skill ?? null,
          body.assigneeId ?? null,
          body.priority,
          body.estimateHours ?? null,
          body.plannedStart ?? null,
          body.plannedEnd ?? null,
        ],
      );
      await replaceDependencies(client, rows[0].id, body.dependsOn);
      return { id: rows[0].id, list: target };
    });

    await board.recordActivity({
      projectId: project.id,
      taskId: id,
      user: req.user,
      type: "card_created",
      message: `${req.user.name} creó la tarjeta "${body.title}" en ${list.title}`,
      data: { listId: list.id },
    });
    res.status(201).json({ ok: true, task: await board.loadCard(id) });
  }),
);

// ─── Detalle ────────────────────────────────────────────────────────────────
tasksRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await getTask(req.user.id, req.params.id, { members: true });
    const [card, checklist, comments, deps, activity] = await Promise.all([
      board.loadCard(task.id),
      db.query("SELECT * FROM checklist_items WHERE task_id = $1 ORDER BY position, created_at", [task.id]),
      db.query(
        `SELECT c.*, u.name AS user_name FROM task_comments c LEFT JOIN users u ON u.id = c.user_id
         WHERE c.task_id = $1 ORDER BY c.created_at`,
        [task.id],
      ),
      db.query(
        `SELECT k.id, k.title, k.board_column FROM task_dependencies d JOIN tasks k ON k.id = d.depends_on_id
         WHERE d.task_id = $1 ORDER BY k.title`,
        [task.id],
      ),
      db.query(
        `SELECT a.id, a.type, a.message, a.created_at FROM board_activity a
         WHERE a.task_id = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT 50`,
        [task.id],
      ),
    ]);
    res.json({
      ok: true,
      task: {
        ...card,
        checklistItems: checklist.rows.map(serializeItem),
        comments: comments.rows.map((c) => serializeComment(c, req.user.id)),
        dependencies: deps.rows.map((d) => ({ id: d.id, title: d.title, stage: d.board_column })),
        activity: activity.rows.map((a) => ({
          id: Number(a.id),
          type: a.type,
          message: a.message,
          createdAt: a.created_at,
        })),
      },
    });
  }),
);

// ─── Editar ─────────────────────────────────────────────────────────────────
tasksRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await getTask(req.user.id, req.params.id, { members: true });
    const body = validate(PatchSchema, req.body);
    const project = { id: task.project_id, team_id: task.team_id };
    await checkRefs(
      project,
      {
        ...body,
        plannedStart: body.plannedStart ?? day(task.planned_start),
        plannedEnd: body.plannedEnd ?? day(task.planned_end),
      },
      task.id,
    );

    const fields = Object.keys(PATCH_COLUMNS).filter((k) => body[k] !== undefined);
    await db.withTransaction(async (client) => {
      if (fields.length > 0) {
        const sets = fields.map((k, i) => `${PATCH_COLUMNS[k]} = $${i + 2}`);
        await client.query(`UPDATE tasks SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`, [
          task.id,
          ...fields.map((k) => body[k]),
        ]);
      }
      if (body.dependsOn) await replaceDependencies(client, task.id, body.dependsOn);
    });

    const card = await board.loadCard(task.id);
    const assigned = body.assigneeId !== undefined && body.assigneeId !== task.assignee_id;
    await board.recordActivity({
      projectId: task.project_id,
      taskId: task.id,
      user: req.user,
      type: assigned ? "card_assigned" : "card_updated",
      message: assigned
        ? card.assignee
          ? `${req.user.name} asignó "${card.title}" a ${card.assignee.name}`
          : `${req.user.name} quitó el responsable de "${card.title}"`
        : `${req.user.name} editó "${card.title}"`,
      data: { fields: [...fields, ...(body.dependsOn ? ["dependsOn"] : [])] },
    });
    res.json({ ok: true, task: card });
  }),
);

// ─── Mover ──────────────────────────────────────────────────────────────────
tasksRouter.patch(
  "/:id/move",
  asyncHandler(async (req, res) => {
    const task = await getTask(req.user.id, req.params.id, { members: true });
    if (task.archived_at) throw conflict("La tarjeta esta archivada; restaurala primero");
    const { listId, column, position } = validate(MoveSchema, req.body);

    const { from, to } = await db.withTransaction(async (client) => {
      // Se bloquean las listas del proyecto para que dos movimientos al mismo
      // tiempo no dejen posiciones repetidas.
      const { rows: lists } = await client.query(
        "SELECT * FROM board_lists WHERE project_id = $1 ORDER BY position FOR UPDATE",
        [task.project_id],
      );
      const target = listId ? lists.find((l) => l.id === listId) : lists.find((l) => l.stage === column);
      if (!target) throw badRequest(listId ? "La lista no es de este proyecto" : `No hay una lista de etapa ${column}`);
      const source = lists.find((l) => l.id === task.list_id);

      const ids = await cardIdsIn(client, target.id, task.id);
      ids.splice(Math.min(position, ids.length), 0, task.id);
      await client.query("UPDATE tasks SET list_id = $2, board_column = $3, updated_at = NOW() WHERE id = $1", [
        task.id,
        target.id,
        target.stage,
      ]);
      await board.renumber(client, "tasks", ids);
      if (source.id !== target.id) await board.renumber(client, "tasks", await cardIdsIn(client, source.id));
      return { from: source, to: target };
    });

    await board.recordActivity({
      projectId: task.project_id,
      taskId: task.id,
      user: req.user,
      type: "card_moved",
      message:
        from.id === to.id
          ? `${req.user.name} reordenó "${task.title}" en ${to.title}`
          : `${req.user.name} movió "${task.title}" de ${from.title} a ${to.title}`,
      data: { fromListId: from.id, toListId: to.id, position },
    });
    res.json({ ok: true, task: await board.loadCard(task.id) });
  }),
);

// ─── Archivar, restaurar y borrar ───────────────────────────────────────────
tasksRouter.post(
  "/:id/archive",
  asyncHandler(async (req, res) => {
    const task = await getTask(req.user.id, req.params.id, { members: true });
    if (task.archived_at) throw conflict("La tarjeta ya esta archivada");
    await db.withTransaction(async (client) => {
      await client.query("UPDATE tasks SET archived_at = NOW(), updated_at = NOW() WHERE id = $1", [task.id]);
      await board.renumber(client, "tasks", await cardIdsIn(client, task.list_id));
    });
    await board.recordActivity({
      projectId: task.project_id,
      taskId: task.id,
      user: req.user,
      type: "card_archived",
      message: `${req.user.name} archivó "${task.title}"`,
    });
    res.json({ ok: true, task: await board.loadCard(task.id) });
  }),
);

tasksRouter.post(
  "/:id/restore",
  asyncHandler(async (req, res) => {
    const task = await getTask(req.user.id, req.params.id, { members: true });
    if (!task.archived_at) throw conflict("La tarjeta no esta archivada");
    await db.query(
      `UPDATE tasks SET archived_at = NULL, updated_at = NOW(),
              position = (SELECT COALESCE(MAX(position) + 1, 0) FROM tasks WHERE list_id = $2 AND archived_at IS NULL)
       WHERE id = $1`,
      [task.id, task.list_id],
    );
    await board.recordActivity({
      projectId: task.project_id,
      taskId: task.id,
      user: req.user,
      type: "card_restored",
      message: `${req.user.name} restauró "${task.title}"`,
    });
    res.json({ ok: true, task: await board.loadCard(task.id) });
  }),
);

tasksRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await getTask(req.user.id, req.params.id);
    await db.withTransaction(async (client) => {
      await client.query("DELETE FROM tasks WHERE id = $1", [task.id]);
      await board.renumber(client, "tasks", await cardIdsIn(client, task.list_id));
    });
    await board.recordActivity({
      projectId: task.project_id,
      user: req.user,
      type: "card_deleted",
      message: `${req.user.name} borró "${task.title}"`,
      data: { taskId: task.id },
    });
    res.json({ ok: true });
  }),
);

// ─── Etiquetas de la tarjeta ────────────────────────────────────────────────
tasksRouter.put(
  "/:id/labels",
  asyncHandler(async (req, res) => {
    const task = await getTask(req.user.id, req.params.id, { members: true });
    const { labelIds } = validate(z.object({ labelIds: z.array(z.string().uuid()).max(20) }), req.body);
    const ids = [...new Set(labelIds)];
    if (ids.length > 0) {
      const { rows } = await db.query("SELECT id FROM labels WHERE id = ANY($1) AND project_id = $2", [
        ids,
        task.project_id,
      ]);
      if (rows.length !== ids.length) throw badRequest("Alguna etiqueta no es de este proyecto");
    }
    await db.withTransaction(async (client) => {
      await client.query("DELETE FROM task_labels WHERE task_id = $1", [task.id]);
      for (const labelId of ids) {
        await client.query("INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2)", [task.id, labelId]);
      }
    });
    await board.recordActivity({
      projectId: task.project_id,
      taskId: task.id,
      user: req.user,
      type: "card_labels",
      message: `${req.user.name} cambió las etiquetas de "${task.title}"`,
      data: { labelIds: ids },
    });
    res.json({ ok: true, task: await board.loadCard(task.id) });
  }),
);

// ─── Checklist ──────────────────────────────────────────────────────────────
const serializeItem = (c) => ({ id: c.id, text: c.text, done: c.done, position: c.position });

tasksRouter.post(
  "/:id/checklist",
  asyncHandler(async (req, res) => {
    const task = await getTask(req.user.id, req.params.id, { members: true });
    const { text } = validate(z.object({ text: z.string().trim().min(1, "El texto es obligatorio").max(300) }), req.body);
    const { rows } = await db.query(
      `INSERT INTO checklist_items (task_id, text, position)
       VALUES ($1, $2, (SELECT COALESCE(MAX(position) + 1, 0) FROM checklist_items WHERE task_id = $1))
       RETURNING *`,
      [task.id, text],
    );
    await board.recordActivity({
      projectId: task.project_id,
      taskId: task.id,
      user: req.user,
      type: "checklist_added",
      message: `${req.user.name} agregó "${text}" al checklist de "${task.title}"`,
    });
    res.status(201).json({ ok: true, item: serializeItem(rows[0]) });
  }),
);

checklistRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await getChecklistItem(req.user.id, req.params.id, { members: true });
    const patch = validate(
      z
        .object({
          text: z.string().trim().min(1).max(300),
          done: z.boolean(),
          position: z.coerce.number().int().min(0),
        })
        .partial()
        .refine((o) => Object.keys(o).length > 0, "No hay campos para actualizar"),
      req.body,
    );
    const updated = await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        "UPDATE checklist_items SET text = $2, done = $3 WHERE id = $1 RETURNING *",
        [item.id, patch.text ?? item.text, patch.done ?? item.done],
      );
      if (patch.position !== undefined) {
        const { rows: others } = await client.query(
          "SELECT id FROM checklist_items WHERE task_id = $1 AND id <> $2 ORDER BY position, created_at",
          [item.task_id, item.id],
        );
        const ids = others.map((r) => r.id);
        ids.splice(Math.min(patch.position, ids.length), 0, item.id);
        await board.renumber(client, "checklist_items", ids);
        rows[0].position = ids.indexOf(item.id);
      }
      return rows[0];
    });
    if (patch.done !== undefined && patch.done !== item.done) {
      await board.recordActivity({
        projectId: item.project_id,
        taskId: item.task_id,
        user: req.user,
        type: patch.done ? "checklist_done" : "checklist_undone",
        message: patch.done
          ? `${req.user.name} completó "${updated.text}" en "${item.task_title}"`
          : `${req.user.name} marcó como pendiente "${updated.text}" en "${item.task_title}"`,
      });
    }
    res.json({ ok: true, item: serializeItem(updated) });
  }),
);

checklistRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await getChecklistItem(req.user.id, req.params.id, { members: true });
    await db.withTransaction(async (client) => {
      await client.query("DELETE FROM checklist_items WHERE id = $1", [item.id]);
      const { rows } = await client.query(
        "SELECT id FROM checklist_items WHERE task_id = $1 ORDER BY position, created_at",
        [item.task_id],
      );
      await board.renumber(
        client,
        "checklist_items",
        rows.map((r) => r.id),
      );
    });
    res.json({ ok: true });
  }),
);

// ─── Comentarios ────────────────────────────────────────────────────────────
function serializeComment(c, currentUserId) {
  return {
    id: c.id,
    body: c.body,
    author: c.user_id ? { id: c.user_id, name: c.user_name } : null,
    mine: c.user_id === currentUserId,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

const CommentSchema = z.object({ body: z.string().trim().min(1, "El comentario esta vacio").max(5000) });

tasksRouter.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const task = await getTask(req.user.id, req.params.id, { members: true });
    const { body } = validate(CommentSchema, req.body);
    const { rows } = await db.query(
      "INSERT INTO task_comments (task_id, user_id, body) VALUES ($1, $2, $3) RETURNING *",
      [task.id, req.user.id, body],
    );
    await board.recordActivity({
      projectId: task.project_id,
      taskId: task.id,
      user: req.user,
      type: "comment_added",
      message: `${req.user.name} comentó en "${task.title}"`,
      data: { commentId: rows[0].id },
    });
    res.status(201).json({ ok: true, comment: serializeComment({ ...rows[0], user_name: req.user.name }, req.user.id) });
  }),
);

/** Solo quien escribio el comentario lo puede editar o borrar. */
function requireAuthor(comment, userId) {
  if (comment.user_id !== userId) throw new HttpError(403, "Solo quien escribio el comentario puede cambiarlo");
}

commentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const comment = await getComment(req.user.id, req.params.id, { members: true });
    requireAuthor(comment, req.user.id);
    const { body } = validate(CommentSchema, req.body);
    const { rows } = await db.query(
      "UPDATE task_comments SET body = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
      [comment.id, body],
    );
    res.json({ ok: true, comment: serializeComment({ ...rows[0], user_name: req.user.name }, req.user.id) });
  }),
);

commentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const comment = await getComment(req.user.id, req.params.id, { members: true });
    requireAuthor(comment, req.user.id);
    await db.query("DELETE FROM task_comments WHERE id = $1", [comment.id]);
    res.json({ ok: true });
  }),
);

module.exports = { projectCardsRouter, tasksRouter, checklistRouter, commentsRouter };

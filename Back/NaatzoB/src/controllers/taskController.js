const { readDb, writeDb } = require("../repositories/dbRepository");
const { createId } = require("../utils/id");
const { HttpError } = require("../utils/httpError");
const { getReminderStatus } = require("../services/notificationService");

function normalizeDueAt(input) {
  if (!input) return null;
  const value = new Date(input);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

function serializeTask(task) {
  return {
    id: task.id,
    userId: task.userId,
    title: task.title,
    description: task.description,
    dueAt: task.dueAt,
    dueDate: task.dueAt,
    completed: task.completed,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

async function listTasks(req, res, next) {
  try {
    const { userId, from, to } = req.query;
    const ownerId = req.user?.id || userId;

    const db = await readDb();
    let tasks = db.tasks;

    if (ownerId) {
      tasks = tasks.filter((t) => t.userId === ownerId);
    }

    if (from) {
      const fromDate = new Date(from);
      tasks = tasks.filter((t) => new Date(t.dueAt) >= fromDate);
    }

    if (to) {
      const toDate = new Date(to);
      tasks = tasks.filter((t) => new Date(t.dueAt) <= toDate);
    }

    res.json({ tasks: tasks.map(serializeTask) });
  } catch (error) {
    next(error);
  }
}

async function createTask(req, res, next) {
  try {
    const { userId, title, description = "", dueAt, dueDate } = req.body;
    if (req.user && req.user.id !== userId) throw new HttpError(403, 'No puedes crear tareas para otra cuenta');

    if (!userId || !title || !(dueAt || dueDate)) {
      throw new HttpError(400, "userId, title y dueAt/dueDate son obligatorios");
    }

    const normalizedDueAt = normalizeDueAt(dueAt || dueDate);
    if (typeof title !== 'string' || !title.trim()) throw new HttpError(400, 'El título no puede estar vacío');
    if (!normalizedDueAt) {
      throw new HttpError(400, "Formato de fecha invalido");
    }

    const db = await readDb();
    const task = {
      id: createId("tsk"),
      userId,
      title: String(title).trim(),
      description: String(description),
      dueAt: normalizedDueAt,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.tasks.push(task);
    await writeDb(db);

    res.status(201).json({ task: serializeTask(task) });
  } catch (error) {
    next(error);
  }
}

async function updateTask(req, res, next) {
  try {
    const { id } = req.params;
    const db = await readDb();

    const idx = db.tasks.findIndex((t) => t.id === id && (!req.user || t.userId === req.user.id));
    if (idx === -1) {
      throw new HttpError(404, "Tarea no encontrada");
    }

    const current = db.tasks[idx];
    const dueAt = req.body.dueAt || req.body.dueDate;
    const normalizedDueAt = dueAt ? normalizeDueAt(dueAt) : current.dueAt;
    if (!normalizedDueAt) throw new HttpError(400, 'Formato de fecha inválido');
    if (req.body.title !== undefined && (typeof req.body.title !== 'string' || !req.body.title.trim())) throw new HttpError(400, 'El título no puede estar vacío');
    if (req.body.completed !== undefined && typeof req.body.completed !== 'boolean') throw new HttpError(400, 'El estado debe ser verdadero o falso');

    db.tasks[idx] = {
      ...current,
      title: req.body.title !== undefined ? String(req.body.title).trim() : current.title,
      description:
        req.body.description !== undefined ? String(req.body.description) : current.description,
      completed:
        req.body.completed !== undefined ? Boolean(req.body.completed) : current.completed,
      dueAt: normalizedDueAt,
      updatedAt: new Date().toISOString(),
    };

    await writeDb(db);
    res.json({ task: serializeTask(db.tasks[idx]) });
  } catch (error) {
    next(error);
  }
}

async function deleteTask(req, res, next) {
  try {
    const { id } = req.params;
    const db = await readDb();
    const idx = db.tasks.findIndex((t) => t.id === id && (!req.user || t.userId === req.user.id));

    if (idx === -1) {
      throw new HttpError(404, "Tarea no encontrada");
    }

    db.tasks.splice(idx, 1);
    await writeDb(db);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function getTaskReminders(req, res, next) {
  try {
    const { id } = req.params;
    const db = await readDb();
    const task = db.tasks.find((t) => t.id === id && (!req.user || t.userId === req.user.id));

    if (!task) {
      throw new HttpError(404, "Tarea no encontrada");
    }

    const reminders = getReminderStatus(task.dueAt);
    res.json({ task: serializeTask(task), reminders });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  getTaskReminders,
};

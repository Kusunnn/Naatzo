const { readDb } = require("../repositories/dbRepository");
const { HttpError } = require("../utils/httpError");
const { buildTaskNotifications } = require("../services/notificationService");
const { findUserById } = require('../repositories/userRepository');

async function getUserNotifications(req, res, next) {
  try {
    const { userId } = req.params;
    if (req.user && req.user.id !== userId) throw new HttpError(403, 'Las notificaciones pertenecen a otra cuenta');
    const db = await readDb();
    const user = await findUserById(userId);

    if (!user) {
      throw new HttpError(404, "Usuario no encontrado");
    }

    const tasks = db.tasks.filter((t) => t.userId === userId);
    const notifications = await buildTaskNotifications(tasks);

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      notifications,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getUserNotifications };

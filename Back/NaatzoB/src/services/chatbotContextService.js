const { recommendBooks } = require('./bookService');
const { resolveTaskReference } = require('../../../../shared/chatTaskReference');

function teamTasksForUser(projects, user) {
  const normalize = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  return projects.flatMap(project => {
    const snapshot = project.snapshot;
    const members = snapshot.members || [];
    let member = members.find(m => m.userId === user.id);
    if (!member) {
      const matches = members.filter(m => !m.userId && m.email && normalize(m.email) === normalize(user.email));
      if (matches.length === 1) member = matches[0];
    }
    if (!member && user.name) {
      const matches = members.filter(m => !m.userId && !m.email && normalize(m.name) === normalize(user.name));
      if (matches.length === 1) member = matches[0];
    }
    if (!member) return [];
    return (snapshot.tasks || []).filter(t => t.assigneeId === member.id && t.column !== 'done')
      .map(t => ({ id: `team:${project.id}:${t.id}`, title: t.title, description: t.description || '', dueAt: t.dueDate || null, projectTitle: snapshot.title, source: 'equipo' }));
  });
}

async function buildChatbotContext(db, userId, question, teamTasks = [], history = []) {
  const personal = (db.tasks || []).filter(t => t.userId === userId && !t.completed)
    .map(t => ({ id: t.id, title: t.title, description: t.description || '', dueAt: t.dueAt }));
  const deadline = t => Number.isFinite(Date.parse(t.dueAt)) ? Date.parse(t.dueAt) : Infinity;
  const pending = [...personal, ...teamTasks].sort((a, b) => deadline(a) - deadline(b));
  const tasks = pending.slice(0, 30);
  const reference = resolveTaskReference(question, history, tasks);
  const words = String(question).toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [];
  const relevant = tasks.filter(t => words.some(w => `${t.title} ${t.description}`.toLowerCase().includes(w)));
  const askingPending = /\b(tareas?|actividades?|pendientes?)\b/i.test(question) && /\b(tengo|pendientes?|proximas?|hacer|faltan)\b/i.test(String(question).normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const asksBooks = /\b(libros?|gutenberg|bibliografia|recomiend|recomendaciones)\b/i.test(question);
  const targets = reference.ordinal !== null ? (reference.task ? [reference.task] : []) : askingPending ? [] : relevant.length ? relevant.slice(0, 2) : asksBooks ? tasks.slice(0, 1) : [];
  const books = (await Promise.all(targets.map(async task => {
    try {
      let timer;
      const result = await Promise.race([
        recommendBooks({ title: task.title, description: task.description, limit: 2 }),
        new Promise(resolve => { timer = setTimeout(() => resolve([]), 4000); }),
      ]).finally(() => clearTimeout(timer));
      return result
        .map(b => ({ title: b.title, author: b.author, url: b.pdfLink, reason: b.reason, taskId: task.id }));
    } catch { return []; } // Gutenberg no debe impedir que el tutor responda.
  }))).flat();
  return { now: new Date().toISOString(), totalPending: pending.length, tasks, books, selectedTask: reference.task };
}

module.exports = { buildChatbotContext, teamTasksForUser };

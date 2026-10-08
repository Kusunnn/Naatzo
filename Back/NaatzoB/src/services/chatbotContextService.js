const { recommendBooks } = require('./bookService');

async function buildChatbotContext(db, userId, question) {
  const tasks = (db.tasks || []).filter(t => t.userId === userId && !t.completed)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)).slice(0, 30)
    .map(t => ({ id: t.id, title: t.title, description: t.description || '', dueAt: t.dueAt }));
  const words = String(question).toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [];
  const relevant = tasks.filter(t => words.some(w => `${t.title} ${t.description}`.toLowerCase().includes(w)));
  const targets = relevant.length ? relevant.slice(0, 2) : tasks.slice(0, 1);
  const books = (await Promise.all(targets.map(async task => {
    try {
      return (await recommendBooks({ title: task.title, description: task.description, limit: 2 }))
        .map(b => ({ title: b.title, author: b.author, url: b.pdfLink, reason: b.reason, taskId: task.id }));
    } catch { return []; } // Gutenberg no debe impedir que el tutor responda.
  }))).flat();
  return { now: new Date().toISOString(), tasks, books };
}

module.exports = { buildChatbotContext };

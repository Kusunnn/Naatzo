const { test } = require('node:test');
const assert = require('node:assert/strict');
const books = require('../src/services/bookService');
books.recommendBooks = async ({ title }) => [{ title, author: 'Autor', pdfLink: 'https://www.gutenberg.org/ebooks/1', reason: 'Catálogo' }];
const { buildChatbotContext, teamTasksForUser } = require('../src/services/chatbotContextService');
test('context only includes owner pending tasks, ordered by due date, and real catalog links', async () => {
  const db = { tasks: [
    { id: 'foreign', userId: 'other', title: 'Privado', dueAt: '2026-01-01' },
    { id: 'done', userId: 'me', title: 'Terminado', completed: true },
    { id: 'math', userId: 'me', title: 'Cálculo', dueAt: '2026-10-10' },
    { id: 'biology', userId: 'me', title: 'Biología', dueAt: '2026-10-09' },
  ] };
  const ctx = await buildChatbotContext(db, 'me', 'Ayúdame con cálculo');
  assert.deepEqual(ctx.tasks.map(t => t.id), ['biology', 'math']);
  assert.equal(ctx.books[0].taskId, 'math');
  assert.equal(ctx.books[0].url, 'https://www.gutenberg.org/ebooks/1');
});
test('an empty pending list does not invent recommendations', async () => {
  assert.deepEqual((await buildChatbotContext({ tasks: [] }, 'me', 'Hola')).books, []);
});
test('a greeting does not wait for book recommendations even with pending tasks', async () => {
  const ctx = await buildChatbotContext({ tasks: [{ id: 'math', userId: 'me', title: 'Cálculo' }] }, 'me', 'hola');
  assert.equal(ctx.totalPending, 1);
  assert.deepEqual(ctx.books, []);
});
test('team tasks are scoped to assigned member, ordered with personal tasks, and available for pending questions', async () => {
  const user = { id: 'me', name: 'Ana', email: 'ana@example.test' };
  const projects = [{ id: 'p', snapshot: { title: 'Financiero', members: [{ id: 'm', userId: 'me' }], tasks: [
    { id: 'next', title: 'Calcular crédito', assigneeId: 'm', column: 'first-tasks', dueDate: '2026-10-09' },
    { id: 'soon', title: 'Revisar requisitos', assigneeId: 'm', column: 'todo', dueDate: '2026-10-08' },
    { id: 'done', assigneeId: 'm', column: 'done' },
    { id: 'other', assigneeId: 'someone', column: 'todo' },
    { id: 'undated', title: 'Sin fecha', assigneeId: 'm', column: 'todo' },
  ] } }];
  const team = teamTasksForUser(projects, user);
  assert.equal(team.length, 3);
  const ctx = await buildChatbotContext({ tasks: [] }, 'me', '¿Qué tareas pendientes tengo?', team);
  assert.equal(ctx.totalPending, 3);
  assert.deepEqual(ctx.tasks.map(t => t.title), ['Revisar requisitos', 'Calcular crédito', 'Sin fecha']);
  assert.equal(ctx.tasks[0].projectTitle, 'Financiero');
  assert.deepEqual(ctx.books, []);
  assert.deepEqual(teamTasksForUser(projects, { id: 'stranger' }), []);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const books = require('../src/services/bookService');
books.recommendBooks = async ({ title }) => [{ title, author: 'Autor', pdfLink: 'https://www.gutenberg.org/ebooks/1', reason: 'Catálogo' }];
const { buildChatbotContext } = require('../src/services/chatbotContextService');
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

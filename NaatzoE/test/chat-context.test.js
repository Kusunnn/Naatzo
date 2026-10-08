const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const ai = require('../src/services/ai');
const embeddings = require('../src/services/embeddings');
const search = require('../src/services/search');
const queries = [];
db.query = async (sql) => {
  queries.push(sql);
  if (sql.includes('chat_sessions')) return { rows: [{ id: 'session' }] };
  return { rows: [{ role: 'assistant', content: 'Mensaje reciente' }, { role: 'user', content: 'Sobre mi documento' }] };
};
db.withTransaction = async callback => callback({ query: async () => ({ rows: [] }) });
embeddings.getEmbedding = async () => [1];
search.searchRelevantChunks = async () => [{ content: 'Contenido del archivo adjunto', resource_title: 'apuntes.txt', score: 0.1 }];
ai.generateJson = async () => ({ rewritten: 'Pregunta del documento' });
let prompt;
ai.generateText = async options => { prompt = options; return 'Respuesta completa'; };
const chat = require('../src/services/chat.service');
test('pending tasks and books coexist with document context and recent history', async () => {
  const result = await chat.answerQuestion({ question: 'Ayúdame', sessionId: 'session', userContext: {
    tasks: [{ title: 'Tarea de cálculo' }], books: [{ title: 'Libro real', url: 'https://www.gutenberg.org/ebooks/1' }],
  } });
  assert.equal(result.answer, 'Respuesta completa');
  for (const text of ['Tarea de cálculo', 'Libro real', 'Contenido del archivo adjunto', 'Mensaje reciente']) assert.ok(prompt.userPrompt.includes(text));
  assert.equal(prompt.completeResponse, true);
  assert.ok(queries.some(sql => sql.includes('ORDER BY created_at DESC')));
});

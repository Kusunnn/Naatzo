const { test } = require('node:test');
const assert = require('node:assert/strict');
const { quickAnswer } = require('../src/services/chat-quick-answer');
test('greetings and task listing bypass AI while substantive questions do not', () => {
  const context = { now: '2026-10-08T14:00:00Z', totalPending: 2, tasks: [
    { title: 'Crédito', projectTitle: 'Financiero', dueAt: '2026-10-09' },
    { title: 'Requisitos', projectTitle: 'Financiero', dueAt: '2026-10-08T12:00:00Z' },
  ] };
  assert.match(quickAnswer('hola', context), /¡Hola!/);
  const answer = quickAnswer('¿Qué tareas pendientes tengo?', context);
  assert.ok(answer.indexOf('Requisitos') < answer.indexOf('Crédito'));
  assert.match(answer, /Vencida/);
  assert.match(answer, /Financiero/);
  assert.equal(quickAnswer('Ayúdame con mis tareas pendientes', context), null);
  assert.equal(quickAnswer('que me recomiendas para mi 2da tarea?', context), null);
  assert.equal(quickAnswer('¿Cómo resuelvo esta tarea?', context), null);
  assert.match(quickAnswer('qué tareas tengo', { tasks: [] }), /No tienes/);
});
test('ordinal references use the displayed list, not the current task order, and ask when ambiguous', () => {
  const { resolveTaskReference, taskOrdinal } = require('../../shared/chatTaskReference');
  const tasks = [{ title: 'Crédito', projectTitle: 'Financiero' }, { title: 'Requisitos', projectTitle: 'Financiero' }];
  const history = [{ role: 'assistant', content: 'Estas son tus tareas pendientes más próximas:\n\n1. **Requisitos** — Equipo: Financiero\n2. **Crédito** — Equipo: Financiero' }];
  assert.equal(resolveTaskReference('mi 2da tarea', history, tasks).task.title, 'Crédito');
  assert.equal(taskOrdinal('la segunda tarea'), 2);
  assert.equal(resolveTaskReference('mi 2da tarea', [], tasks).task, null);
  assert.equal(resolveTaskReference('mi 7ma tarea', history, tasks).task, null);
});

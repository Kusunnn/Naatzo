const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(name) {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/services', `${name}.ts`), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(p => load(p.replace('./', '')), module, module.exports);
  return module.exports;
}
const { recommendationTasks, recommendationQuery, upcomingTasks } = load('recommendationTasks');
const user = { id: 'me', name: 'Ana', email: 'ana@example.test' };
test('includes pending individual and assigned team tasks, with collision-free IDs and optional dates', () => {
  const project = { id: 'p', title: 'Proyecto', members: [{ id: 'm', userId: 'me' }], tasks: [
    { id: 'same', title: 'Cálculo', description: 'Integrales', assigneeId: 'm', column: 'first-tasks' },
    { id: 'done', assigneeId: 'm', column: 'done' },
    { id: 'other', assigneeId: 'someone', column: 'todo' },
  ] };
  const tasks = recommendationTasks([{ id: 'same', title: 'Personal', description: '', completed: false, dueDate: new Date('2026-10-10') }], [project], user);
  assert.deepEqual(tasks.map(t => t.id), ['individual:same', 'team:p:same']);
  assert.equal(tasks[1].projectTitle, 'Proyecto');
  const teamQuery = new URL(recommendationQuery(tasks[1]), 'http://localhost').searchParams;
  assert.equal(teamQuery.get('taskTitle'), 'Cálculo');
  assert.equal(teamQuery.get('taskDescription'), 'Integrales');
  assert.equal(teamQuery.has('taskId'), false);
  assert.equal(teamQuery.has('dueAt'), false);
  assert.equal(new URL(recommendationQuery(tasks[0]), 'http://localhost').searchParams.get('taskId'), 'same');
});
test('does not recommend completed tasks, unrelated projects, or tasks without a signed-in user', () => {
  assert.deepEqual(recommendationTasks([], [{ id: 'p', members: [], tasks: [] }], user), []);
  assert.deepEqual(recommendationTasks([], [], null), []);
  assert.deepEqual(recommendationTasks([{ id: 'done', completed: true }], [], user), []);
});
test('upcoming reminders include overdue and exactly three days, excluding missing, invalid, and later dates', () => {
  const now = new Date('2026-10-08T12:00:00Z').getTime();
  const tasks = [
    { id: 'boundary', dueDate: new Date(now + 3 * 86400000) },
    { id: 'late', dueDate: new Date(now + 3 * 86400000 + 1) },
    { id: 'missing' },
    { id: 'invalid', dueDate: new Date('invalid') },
    { id: 'overdue', dueDate: new Date(now - 86400000) },
  ];
  assert.deepEqual(upcomingTasks(tasks, now).map(t => t.id), ['overdue', 'boundary']);
});

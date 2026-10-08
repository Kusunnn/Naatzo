const { test } = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../src/repositories/dbRepository');
const users = require('../src/repositories/userRepository');
let writes = 0;
repository.readDb = async () => ({ users: [], tasks: [{ id: 'task', userId: 'owner', title: 'Actividad', dueAt: '2026-10-08T18:00:00Z', completed: false }] });
repository.writeDb = async () => { writes++; };
users.findUserById = async id => id === 'owner' ? { id, name: 'Ana', email: 'ana@example.com' } : null;
require('../src/services/notificationService').buildTaskNotifications = async () => [];
const tasks = require('../src/controllers/taskController');
const notifications = require('../src/controllers/notificationController');
const { cleanSnapshot, view, canRead } = require('../src/services/collaborationService');
const user = { id: 'owner', name: 'Ana', email: 'ana@example.com' };
const sample = () => ({ title: 'Proyecto', members: [{ id: 'member', name: 'Ana', skills: [], userId: user.id }], tasks: [{ id: 'task', title: 'Actividad', column: 'todo', priority: 'alta', assigneeId: 'member', acceptanceCriteria: [{ id: 'criterion', title: 'Validación', completed: false }] }] });

test('rejects invalid task updates without writing', async () => {
  for (const body of [{ dueAt: 'bad' }, { title: '  ' }, { completed: 'false' }]) {
    let error;
    await tasks.updateTask({ params: { id: 'task' }, body }, {}, e => { error = e; });
    assert.equal(error.statusCode, 400);
  }
  assert.equal(writes, 0);
});
test('rejects whitespace-only task titles', async () => {
  let error;
  await tasks.createTask({ body: { userId: 'owner', title: ' ', dueAt: '2026-10-08' } }, {}, e => { error = e; });
  assert.equal(error.statusCode, 400);
});
test('notifications find PostgreSQL users even when JSON users are empty', async () => {
  repository.readDb = async () => ({ users: [], tasks: [] });
  // The controller captures the original read function; its task is outside the reminder window.
  let payload; let error;
  await notifications.getUserNotifications({ params: { userId: 'owner' } }, { json: data => { payload = data; } }, e => { error = e; });
  assert.equal(error, undefined);
  assert.equal(payload.user.id, 'owner');
});
test('project snapshots reject invalid members, dates, assignments and criteria', () => {
  for (const mutate of [
    p => p.members.push({ ...p.members[0] }),
    p => { p.tasks[0].dueDate = 'bad'; },
    p => { p.tasks[0].assigneeId = 'missing'; },
    p => { p.tasks[0].column = 'done'; },
    p => { p.tasks[0].acceptanceCriteria[0].completed = 'true'; },
  ]) { const data = sample(); mutate(data); assert.throws(() => cleanSnapshot(data, user)); }
});
test('sharing preserves verified identities and cannot impersonate another member', () => {
  const data = sample(); data.members[0].userId = 'stranger';
  const snapshot = cleanSnapshot(data, user);
  assert.equal(snapshot.members[0].userId, undefined);
  assert.equal(snapshot.members.length,data.members.length);
  const row = { id: 'canonical', owner_id: user.id, snapshot, version: 1 };
  assert.equal(canRead(row, 'stranger'), false);
  assert.equal(canRead(row,user.id),true);
  assert.equal(view(row).tasks[0].projectId, 'canonical');
});

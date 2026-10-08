const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/app');
const teamDb = require('../src/modules/team/db');
const { signToken } = require('../src/modules/team/middleware/auth');
const { zipUrl } = require('../src/modules/team/orchestrator/inputs');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  await teamDb.close();
});

test('ambas APIs responden desde el mismo listener', async () => {
  for (const path of ['/api/health', '/api/team/health', '/api/team']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.ok(await response.json());
  }
});
test('auth individual y auth de equipos conservan sus contratos', async () => {
  for (const path of ['/api/auth/login', '/api/team/auth/login']) {
    const response = await fetch(base + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 400, path);
  }
});
test('las tareas y notificaciones de equipos requieren su token', async () => {
  for (const [path, method] of [['/api/team/teams', 'GET'], ['/api/team/tasks/example', 'GET'], ['/api/team/notifications/check', 'POST']]) {
    assert.equal((await fetch(base + path, { method })).status, 401, path);
  }
});
test('un token válido llega al módulo de equipos, no al individual', async () => {
  const original = teamDb.query;
  let called = false;
  teamDb.query = async () => { called = true; return { rows: [] }; };
  try {
    const token = signToken({ id: '00000000-0000-4000-8000-000000000001', email: 'test@example.com', name: 'Test' });
    const response = await fetch(base + '/api/team/teams', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    assert.equal(called, true);
  } finally { teamDb.query = original; }
});
test('el enlace de ZIP apunta al nuevo namespace', () => {
  assert.match(zipUrl('example'), /\/api\/team\/projects\/example\/environment\/zip$/);
});
test('las rutas inexistentes conservan su 404 en ambos módulos', async () => {
  for (const path of ['/api/does-not-exist', '/api/team/does-not-exist']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
});

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { createDatabase } = require('../src/db/createDatabase');
const { migrate } = require('../src/modules/team/db/migrate');
const teamDb = require('../src/modules/team/db');
after(() => teamDb.close());

test('las consultas de equipos fijan su esquema dentro de la transacción', async t => {
  const calls = [];
  t.mock.method(Pool.prototype, 'connect', async () => ({
    query: async sql => { calls.push(sql); return { rows: [{ value: 1 }] }; },
    release: () => calls.push('release'),
  }));
  const db = createDatabase({ connectionString: 'postgresql://localhost/test', ssl: false, schema: 'naatzo_team' });
  const result = await db.query('SELECT 1');
  assert.equal(result.rows[0].value, 1);
  assert.deepEqual(calls, ['BEGIN', 'SET LOCAL search_path TO naatzo_team, pg_catalog', 'SELECT 1', 'COMMIT', 'release']);
  await db.close();
});
test('los errores revierten la transacción y liberan la conexión', async t => {
  const calls = [];
  t.mock.method(Pool.prototype, 'connect', async () => ({
    query: async sql => { calls.push(sql); if (sql === 'FAIL') throw new Error('expected'); },
    release: () => calls.push('release'),
  }));
  const db = createDatabase({ connectionString: 'postgresql://localhost/test', schema: 'naatzo_team' });
  await assert.rejects(db.query('FAIL'), /expected/);
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'release']);
  await db.close();
});
test('un nombre de esquema no válido se rechaza antes de conectar', () => {
  assert.throws(() => createDatabase({ schema: 'team; DROP SCHEMA public' }), /Esquema inválido/);
});

test('las migraciones mantienen search_path aislado, compartiendo solo cuentas explícitas', async t => {
  t.mock.method(require('../src/repositories/userRepository'), 'ensureUserTable', async () => {});
  const calls = [];
  t.mock.method(Pool.prototype, 'connect', async () => ({
    query: async sql => { calls.push(sql); return { rows: [] }; },
    release: () => calls.push('release'),
  }));
  await migrate();
  assert.equal(calls[0], 'BEGIN');
  assert.ok(calls.includes('SET LOCAL search_path TO naatzo_team, pg_catalog'));
  assert.equal(calls.filter(sql => sql.startsWith('INSERT INTO schema_migrations')).length, 11);
  assert.equal(calls.filter(sql => sql === 'COMMIT').length, 1);
  assert.equal(calls.some(sql => /search_path.*public/.test(sql)), false);
});
test('una migración fallida revierte todos sus cambios', async t => {
  t.mock.method(require('../src/repositories/userRepository'), 'ensureUserTable', async () => {});
  const calls = [];
  t.mock.method(Pool.prototype, 'connect', async () => ({
    query: async sql => {
      calls.push(sql);
      if (sql.includes('CREATE TABLE users')) throw new Error('simulated failure');
      return { rows: [] };
    },
    release: () => calls.push('release'),
  }));
  await assert.rejects(migrate(), /001_init.sql/);
  assert.equal(calls.includes('COMMIT'), false);
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'release']);
});

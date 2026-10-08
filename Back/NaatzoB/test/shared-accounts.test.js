const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { hashPassword, verifyPassword } = require('../src/utils/password');
const users = require('../src/repositories/userRepository');
const { app } = require('../src/app');
const teamDb = require('../src/modules/team/db');
const email = require('../src/modules/team/integrations/email');
const { signToken } = require('../src/modules/team/middleware/auth');
const { acceptInvitation } = require('../src/modules/team/routes/invitations.routes');
let server, base;
const account = { id: '00000000-0000-4000-8000-000000000001', name: 'Test', email: 'test@example.com', passwordHash: hashPassword('12345') };
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { await new Promise(r => server.close(r)); await teamDb.close(); });

test('el mismo usuario y contraseña funcionan en ambos prefijos y devuelven token', async t => {
  t.mock.method(users, 'findUserByEmail', async () => account);
  for (const path of ['/api/auth/login', '/api/team/auth/login']) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: '12345' }) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.user.id, account.id);
    assert.equal(jwt.decode(result.token).sub, account.id);
    assert.equal(result.user.passwordHash, undefined);
  }
});
test('las contraseñas anteriores PBKDF2 y bcrypt siguen siendo válidas', () => {
  assert.equal(verifyPassword('12345', account.passwordHash), true);
  assert.equal(verifyPassword('12345', bcrypt.hashSync('12345', 4)), true);
  assert.equal(verifyPassword('wrong', account.passwordHash), false);
  assert.equal(verifyPassword('anything', 'broken:hash'), false);
});
test('la invitación solo la acepta la cuenta del correo destinatario', async () => {
  const client = { query: async sql => ({ rows: sql.includes('FROM team_invitations') ? [{ id: 'inv', active: true, recipient_email: 'invited@example.com', expires_at: new Date(Date.now() + 100000).toISOString() }] : [{ email: account.email }] }) };
  await assert.rejects(acceptInvitation(client, 'code', account.id), error => error.status === 403);
});

for (const scenario of ['sent', 'not_configured', 'failed']) {
  test(`la creación de invitación informa el estado real de correo: ${scenario}`, async t => {
    const member = { id: '00000000-0000-4000-8000-000000000002', team_id: 'team', name: 'Invited', access_role: 'owner', active: true, contact: { email: 'invited@example.com' } };
    t.mock.method(teamDb, 'query', async sql => ({ rows: sql.includes('SELECT m.*') ? [member] : [] }));
    t.mock.method(teamDb, 'withTransaction', async fn => fn({ query: async () => ({ rows: [{ id: 'invite-id' }] }) }));
    t.mock.method(email, 'isConfigured', () => scenario !== 'not_configured');
    let sent = false;
    t.mock.method(email, 'send', async message => {
      sent = true;
      assert.equal(message.to, 'invited@example.com');
      assert.match(message.text, /\/invite\//);
      if (scenario === 'failed') throw new Error('simulated SMTP failure');
    });
    const response = await fetch(base + `/api/team/members/${member.id}/invite`, { method: 'POST', headers: { Authorization: `Bearer ${signToken(account)}` } });
    const result = await response.json();
    assert.equal(response.status, 201);
    assert.equal(result.email.status, scenario);
    assert.equal(sent, scenario !== 'not_configured');
    assert.match(result.inviteUrl, /\/invite\//);
  });
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.LLM_PROVIDER = 'ollama';
const { fastPlan } = require('../src/modules/team/agents/planner-autonomy');
const ctx = { progress() {} };
test('fast planner decides once, corrects once, and evaluates both drafts', async () => {
  let decisions = 0, drafts = 0, evaluations = 0;
  const result = await fastPlan({ ctx, consult: async () => ['member'],
    propose: async () => ({ draft: ++drafts }),
    evaluate: async () => ({ valid: ++evaluations === 2, errors: ['dependencia inválida'] }),
    decide: async () => { decisions++; return { action: 'propose_plan', reason: 'Repara dependencia' }; },
  });
  assert.equal(decisions, 1); assert.equal(drafts, 2); assert.equal(result.evaluation.valid, true);
});
test('fast planner refuses an invalid final draft without a third attempt', async () => {
  let drafts = 0;
  await assert.rejects(fastPlan({ ctx, consult: async () => [], propose: async () => (++drafts, {}),
    evaluate: async () => ({ valid: false, errors: ['inválido'] }),
    decide: async () => ({ action: 'propose_plan', reason: 'Corrige' }),
  }), /tablero anterior no se reemplazó/);
  assert.equal(drafts, 2);
});
const llm = require('../src/modules/team/llm/client');
const db = require('../src/modules/team/db');
const github = require('../src/modules/team/integrations/github');
let target = 'teams_proposal', publishes = 0;
let readmes = 0;
llm.generateStructured = async options => {
  if (options.mockKey === 'readme') {
    readmes++;
    return { description: 'Descripción real del proyecto y sus entregables.', architecture: 'Organización del proyecto basada en sus actividades.', modules: [] };
  }
  if (options.mockKey === 'notifySummary') return { summary: 'El proyecto está listo para comenzar con las actividades asignadas.' };
  return { target, reason: 'Objetivo del documento' };
};
db.query = async () => ({ rows: [] });
db.withTransaction = async fn => fn({ query: db.query });
github.isConfigured = () => true;
github.publishRepo = async () => { publishes++; return { url: 'https://github.com/test/project', name: 'project' }; };
const devops = require('../src/modules/team/agents/devops');
test('DevOps proposes Teams without claiming creation, generates README and never publishes GitHub', async () => {
  const result = await devops.run({ projectId: 'test', projectName: 'Investigación', analysis: { objective: 'Investigar biología', requirements: [], stack: {} }, modules: [] }, ctx);
  assert.equal(result.teams.status, 'proposed'); assert.match(result.summary, /propuesto/);
  assert.doesNotMatch(result.summary, /SIMULACIÓN|creado/);
  assert.equal(result.files[0].path, 'README.md');
  assert.equal(result.repoUrl, null); assert.ok(result.zipUrl); assert.equal(publishes, 0);
});
test('DevOps software uses the actual publishing adapter', async () => {
  target = 'github';
  const result = await devops.run({ projectId: 'test', projectName: 'Aplicación', analysis: { objective: 'Crear software', requirements: [], stack: {} }, modules: [] }, ctx);
  assert.equal(result.github.status, 'created'); assert.equal(publishes, 1);
  assert.equal(readmes, 2);
});

const notify = require('../src/modules/team/integrations/notify');
let sent;
notify.teamRecipients = async () => [{ email: 'owner@example.com', name: 'Dueño' }];
notify.currentChannel = () => 'correo';
notify.notify = async payload => { sent = payload; return { status: 'sent', channel: 'correo', recipients: ['owner@example.com'] }; };
const notifier = require('../src/modules/team/agents/notifier');
test('Notifier generates a summary and passes owner email to the delivery adapter', async () => {
  const result = await notifier.run({ projectId: 'test', projectName: 'Investigación', objective: 'Investigar',
    boardUrl: '/board', teams: { channelName: 'Investigación' }, plan: { taskCount: 1, moduleCount: 1, overloaded: [], proposals: [] },
  }, { ...ctx, runId: 'run-test' });
  assert.equal(result.status, 'sent');
  assert.equal(sent.emails[0].to, 'owner@example.com');
  assert.match(sent.emails[0].text, /actividades asignadas/);
  assert.match(sent.message, /Teams propuesto/);
  assert.doesNotMatch(sent.message, /SIMULACIÓN/);
});

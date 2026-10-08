const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.LLM_PROVIDER = 'ollama';
const llm = require('../src/modules/team/llm/client');
const db = require('../src/modules/team/db');
const board = require('../src/modules/team/db/board');
const mock = require('../src/modules/team/llm/mock');
const { PlanSchema } = require('../src/modules/team/llm/schemas');
let drafts = 0, finalized = false, writes = 0, invalidAlways = false;
llm.generateStructured = async options => {
  assert.equal(options.responseSchema?.properties?.action, undefined, 'sin llamada extra para decidir');
  if (options.zodSchema === PlanSchema) {
    const plan = mock.get('planner');
    if (++drafts === 1 || invalidAlways) plan.modules[0].tasks[0].dependsOn = ['NO_EXISTE'];
    else { assert.match(options.user, /Dependencias inválidas/); finalized = true; }
    return plan;
  }
  return { explanation: 'Riesgos calculados por el sistema.' };
};
db.withTransaction = async fn => {
  assert.equal(finalized, true, 'no se escribe antes de finalizar y evaluar');
  writes++;
  let id = 0;
  return fn({ query: async () => ({ rows: [{ id: `id-${++id}` }] }) });
};
board.ensureLists = async () => [{ id: 'todo', title: 'Por hacer', stage: 'todo', position: 0 }, { id: 'first', title: 'Primeras tareas', stage: 'todo', position: 1 }];
board.recordActivity = async () => {};
const planner = require('../src/modules/team/agents/planner');
test('real planner integration repairs invalid dependencies through observations and saves once', async () => {
  const result = await planner.run({ projectId: 'test', projectName: 'Prueba', analysis: mock.get('analyst'),
    members: [{ id: 'ana', name: 'Ana', skills: ['frontend', 'backend', 'devops', 'diseno'], weeklyHours: 40 }],
    startDate: '2026-10-08', deadline: '2027-11-20',
  }, { progress: () => {}, recordLlm: () => {} });
  assert.equal(result.autonomy.enabled, false);
  assert.equal(result.validation.drafts, 2);
  assert.equal(writes, 1);
  assert.equal(result.validation.valid, true);
  assert.ok(result.tasks.every(t => !t.flags.includes('dependencia_invalida')));
  assert.ok(result.tasks.filter(t => t.column === 'first-tasks').length <= 2);
});

test('direct planner never saves when both proposals have invalid dependencies', async () => {
  const before = writes;
  drafts = 0;
  invalidAlways = true;
  finalized = false;
  await assert.rejects(planner.run({ projectId: 'test', projectName: 'Prueba', analysis: mock.get('analyst'),
    members: [{ id: 'ana', name: 'Ana', skills: ['frontend', 'backend', 'devops', 'diseno'], weeklyHours: 40 }],
    startDate: '2026-10-08', deadline: '2027-11-20',
  }, { progress() {}, recordLlm() {} }), /tablero anterior no se reemplazó/);
  assert.equal(drafts, 2);
  assert.equal(writes, before);
});

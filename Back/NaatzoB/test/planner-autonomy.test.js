const { test } = require('node:test');
const assert = require('node:assert/strict');
const { autonomousPlan } = require('../src/modules/team/agents/planner-autonomy');
const plan = { modules: [{ name: 'Estudio', tasks: [{ key: 'T1' }] }] };
function setup(actions) {
  let cursor = 0, proposals = 0;
  const logs = [];
  return { logs, count: () => proposals, options: {
    ctx: { progress: text => logs.push(text) },
    decide: async state => ({ action: actions[cursor++], reason: state.evaluation?.risks?.length ? 'Corregir sobrecarga observada' : 'Avanzar con datos disponibles' }),
    consult: async () => [{ id: 'Ana' }],
    propose: async () => { proposals++; return structuredClone(plan); },
    evaluate: async () => ({ valid: true, risks: [] }),
  } };
}
test('agent chooses tools, sees risks, revises, reevaluates and finishes without writing drafts', async () => {
  const fixture = setup(['consult_capacity', 'propose_plan', 'evaluate_plan', 'propose_plan', 'evaluate_plan', 'finish']);
  let evaluations = 0;
  fixture.options.evaluate = async () => ({ valid: true, risks: ++evaluations === 1 ? [{ type: 'sobrecarga' }] : [] });
  const result = await autonomousPlan(fixture.options);
  assert.equal(result.drafts, 2);
  assert.equal(result.trace.length, 6);
  assert.equal(result.trace[3].reason, 'Corregir sobrecarga observada');
  assert.deepEqual(result.evaluation.risks, []);
  assert.ok(fixture.logs.some(log => log.includes('sobrecarga')));
});
test('cannot finish before evaluation, but can recover from a rejected action', async () => {
  const fixture = setup(['finish', 'consult_capacity', 'propose_plan', 'finish', 'evaluate_plan', 'finish']);
  const result = await autonomousPlan(fixture.options);
  assert.match(result.trace[0].observation.error, /Acción no disponible/);
  assert.match(result.trace[3].observation.error, /Acción no disponible/);
});
test('structural errors cannot be finalized and bounded failures never return a plan to save', async () => {
  const fixture = setup(['consult_capacity', 'propose_plan', 'evaluate_plan', 'finish']);
  fixture.options.evaluate = async () => ({ valid: false, errors: ['Ciclo'], risks: [] });
  await assert.rejects(autonomousPlan({ ...fixture.options, maxSteps: 4 }), error => {
    assert.ok(error.plannerTrace.decisions.length);
    return /tablero anterior no se reemplazó/.test(error.message);
  });
});
test('draft limit, cancellation and elapsed budget stop unbounded work', async () => {
  const fixture = setup(['consult_capacity', 'propose_plan', 'evaluate_plan', 'propose_plan', 'evaluate_plan', 'propose_plan', 'evaluate_plan']);
  fixture.options.evaluate = async () => ({ valid: false, errors: ['Ciclo'], risks: [] });
  await assert.rejects(autonomousPlan({ ...fixture.options, maxSteps: 7 }), /agotó/);
  assert.equal(fixture.count(), 3);
  await assert.rejects(autonomousPlan({ ...fixture.options, ctx: { isCancelled: async () => true } }), /cancelada/);
  await assert.rejects(autonomousPlan({ ...fixture.options, budgetMs: 0 }), /tiempo disponible/);
});
test('available tools prevent repeated capacity reads and endless revision of unavoidable risks', async () => {
  const fixture = setup(['consult_capacity', 'propose_plan', 'evaluate_plan', 'finish']);
  fixture.options.decide = async state => {
    if (!state.capacity) { assert.deepEqual(state.allowedActions, ['consult_capacity']); return { action: 'consult_capacity', reason: 'Leer capacidad' }; }
    if (!state.plan) { assert.deepEqual(state.allowedActions, ['propose_plan']); return { action: 'propose_plan', reason: 'Generar' }; }
    if (!state.evaluation) { assert.deepEqual(state.allowedActions, ['evaluate_plan']); return { action: 'evaluate_plan', reason: 'Comprobar' }; }
    assert.deepEqual(state.allowedActions, ['finish']);
    return { action: 'finish', reason: 'Ya está validado' };
  };
  assert.equal((await autonomousPlan(fixture.options)).trace.length, 4);
});

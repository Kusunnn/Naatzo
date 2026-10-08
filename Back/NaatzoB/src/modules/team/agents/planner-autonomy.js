const { z } = require('zod');
const DecisionSchema = z.object({
  action: z.enum(['consult_capacity', 'propose_plan', 'evaluate_plan', 'finish']),
  reason: z.string().trim().min(1).max(800),
});
const DecisionGemini = { type: 'OBJECT', properties: {
  action: { type: 'STRING', enum: ['consult_capacity', 'propose_plan', 'evaluate_plan', 'finish'] },
  reason: { type: 'STRING' },
}, required: ['action', 'reason'] };

function availableActions({ capacity, plan, evaluation, drafts, maxDrafts }) {
  if (!capacity) return ['consult_capacity'];
  if (!plan) return drafts < maxDrafts ? ['propose_plan'] : [];
  if (!evaluation) return ['evaluate_plan'];
  if (!evaluation.valid) return drafts < maxDrafts ? ['propose_plan'] : [];
  return drafts < maxDrafts && evaluation.risks?.length
    ? ['propose_plan', 'finish'] : ['finish'];
}

async function autonomousPlan({ decide, propose, evaluate, consult, ctx, maxSteps = 10, maxDrafts = 3, budgetMs = 360000 }) {
  const trace = [];
  let plan = null, evaluation = null, capacity = null, drafts = 0;
  const started = Date.now();
  for (let step = 1; step <= maxSteps; step++) {
    if (await ctx.isCancelled?.()) throw new Error('Planificación cancelada; no se guardó el borrador.');
    if (Date.now() - started >= budgetMs) break;
    const allowedActions = availableActions({ capacity, plan, evaluation, drafts, maxDrafts });
    if (!allowedActions.length) break;
    const decision = DecisionSchema.parse(await decide({ step, remainingSteps: maxSteps - step + 1,
      allowedActions,
      remainingDrafts: maxDrafts - drafts, capacity, plan, evaluation, trace }));
    ctx.progress(`Decisión ${step}/${maxSteps}: ${decision.action} — ${decision.reason}`);
    if (await ctx.isCancelled?.()) throw new Error('Planificación cancelada; no se guardó el borrador.');
    let observation;
    if (!allowedActions.includes(decision.action)) {
      observation = { error: `Acción no disponible. Elige: ${allowedActions.join(', ')}. No repitas consultas o propuestas sin evaluarlas.` };
    } else if (decision.action === 'consult_capacity') {
      capacity = await consult();
      evaluation = null; // Una nueva lectura invalida una evaluación anterior.
      observation = { members: capacity };
    } else if (decision.action === 'propose_plan') {
      if (!capacity) observation = { error: 'Consulta primero consult_capacity.' };
      else if (drafts >= maxDrafts) observation = { error: 'Límite de 3 propuestas alcanzado. Evalúa el borrador o finaliza si es válido.' };
      else {
        drafts++;
        try {
          plan = await propose({ previous: plan, evaluation, instruction: decision.reason, members: capacity });
          evaluation = null;
          observation = { draft: drafts, taskCount: plan.modules.reduce((n, m) => n + m.tasks.length, 0) };
        } catch (error) {
          evaluation = { valid: false, errors: [error.message] };
          observation = evaluation;
        }
      }
    } else if (decision.action === 'evaluate_plan') {
      if (!plan || !capacity) observation = { error: 'Primero consulta capacidad y propone un plan.' };
      else {
        evaluation = await evaluate(plan, capacity);
        observation = evaluation;
      }
    } else if (!plan || !evaluation?.valid) {
      observation = { error: 'No se puede finalizar sin una evaluación válida del último borrador.' };
    } else {
      if (await ctx.isCancelled?.()) throw new Error('Planificación cancelada; no se guardó el borrador.');
      trace.push({ step, ...decision, observation: { accepted: true, risks: evaluation.risks } });
      return { plan, members: capacity, trace, drafts, evaluation };
    }
    trace.push({ step, ...decision, observation });
    ctx.progress(`Herramienta ${decision.action}: ${JSON.stringify(observation).slice(0, 1200)}`);
  }
  const reason = Date.now() - started >= budgetMs ? 'el tiempo disponible' : drafts >= maxDrafts && !evaluation?.valid ? 'los intentos de corrección' : 'el número de decisiones';
  const lastError = evaluation?.errors?.join('; ') || trace.at(-1)?.observation?.error || 'No eligió finalizar el plan evaluado.';
  const error = new Error(`El Planificador agotó ${reason} (${trace.length} decisiones, ${drafts} propuestas). ${lastError} El tablero anterior no se reemplazó; reintenta el paso.`);
  error.plannerTrace = { decisions: trace, drafts, evaluation, elapsedMs: Date.now() - started };
  throw error;
}

async function fastPlan({ consult, propose, evaluate, decide, ctx }) {
  const trace = [];
  let plan = null, evaluation = null, drafts = 0;
  const check = async () => {
    if (await ctx.isCancelled?.()) throw new Error('Planificación cancelada; no se guardó el borrador.');
  };
  await check();
  const members = await consult();
  trace.push({ action: 'consult_capacity', observation: { members } });
  const draft = async instruction => {
    await check();
    drafts++;
    ctx.progress(`Generando propuesta ${drafts}/2`);
    try {
      plan = await propose({ previous: plan, evaluation, instruction, members });
      await check();
      evaluation = await evaluate(plan, members);
    } catch (error) {
      await check();
      evaluation = { valid: false, errors: [error.message], risks: [] };
    }
    trace.push({ action: 'evaluate_plan', draft: drafts, observation: evaluation });
  };
  await draft('Genera el plan inicial completo, conciso y fiel al documento.');
  await check();
  const decision = await decide({ allowedActions: evaluation.valid ? ['finish', 'propose_plan'] : ['propose_plan'], evaluation, plan, capacity: members, trace });
  trace.push({ action: decision.action, reason: decision.reason });
  ctx.progress(`Única decisión de revisión: ${decision.action} — ${decision.reason}`);
  if (decision.action === 'propose_plan') await draft(decision.reason);
  await check();
  if (!evaluation.valid || !['finish', 'propose_plan'].includes(decision.action)) {
    const error = new Error(`El plan sigue sin validar después de ${drafts} propuesta(s): ${(evaluation.errors || []).join('; ')}. El tablero anterior no se reemplazó.`);
    error.plannerTrace = { mode: 'fast', decisions: trace, drafts, evaluation };
    throw error;
  }
  return { plan, members, trace, drafts, evaluation };
}

module.exports = { autonomousPlan, fastPlan, DecisionSchema, DecisionGemini, availableActions };

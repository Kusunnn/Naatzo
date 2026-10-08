// src/agents/planner.js
//
// Planificador (seccion 5.2).
//   - El LLM desglosa en modulos y tareas: titulo, habilidad, estimacion,
//     prioridad y dependencias. No asigna personas ni fechas.
//   - El codigo (src/planning/) asigna por carga en orden topologico, calcula
//     fechas, detecta sobrecarga y propone reasignaciones.
//   - Si hay riesgo, el LLM solo redacta la explicacion de lo que calculo el codigo.

const env = require("../config/env");
const db = require("../db");
const board = require("../db/board");
const clock = require("../utils/clock");
const { generateStructured } = require("../llm/client");
const { PlanSchema, planGemini, MAX_TASKS, ExplanationSchema, ExplanationGemini } = require("../llm/schemas");
const { assignTasks } = require("../planning/assign");
const { scheduleTasks } = require("../planning/schedule");
const { weeksUntil, workloadRows } = require("../planning/workload");
const { withAvailability } = require("../planning/availability");
const { proposeReassignments, planRisks } = require("../planning/risks");
const { nextWorkday, maxDate } = require("../planning/dates");
const { describeStack } = require("../templates/catalog");

const SYSTEM = `Eres el Planificador de Naatzo, un gestor de proyectos académicos, de investigación y de software.
Recibes el analisis de un proyecto y desglosas el trabajo en modulos y tareas.

Reglas:
- Respeta el objetivo y el entregable real del documento. Para una exposición o investigación, propone lectura, síntesis, revisión, presentación y entregables pertinentes, no desarrollo de una aplicación.
- No inventes APIs, backend, bases de datos ni tecnologías. Las habilidades técnicas de los integrantes no son requisitos del proyecto.
- Entre 3 y 8 modulos y maximo ${MAX_TASKS} tareas en total.
- Cada tarea: key unica y corta (T1, T2...), titulo concreto, descripcion de una linea,
  skill (una de las habilidades del equipo), estimateHours entre 1 y 16 y priority (high, medium o low).
- Si una tarea es mas grande que 16 horas, dividela.
- dependsOn lista las keys de las tareas que deben terminar antes. No hagas ciclos.
- acceptanceCriteria: entre 2 y 5 condiciones concretas, observables y verificables por tarea.
  Describe resultados esperados y casos de error cuando apliquen, no repitas simplemente el titulo.
  Incluye tareas iniciales de preparacion sin dependencias; no inventes dependencias innecesarias.
- No asignes personas ni pongas fechas: eso lo calcula el sistema.
  Solo si el analisis menciona a alguien para esa tarea, copia su nombre en mentionedOwner; si no, null.
- Prioridad high para lo indispensable de la entrega, low para lo marcado como opcional o no urgente.
- Escribe en espanol.`;

const EXPLAIN_SYSTEM = `Eres el Planificador de Naatzo. Redacta en 2 a 4 oraciones, en espanol y en tono claro,
la situacion del plan a partir de los datos que te dan. No cambies numeros, nombres ni fechas,
no inventes datos y no propongas cambios distintos a los de la lista de propuestas.`;

function buildPrompt(input, skills) {
  const a = input.analysis;
  const members = input.members
    .map((m) => `- ${m.name} (${m.role || "sin rol"}): ${m.skills.join(", ") || "sin habilidades"}`)
    .join("\n");
  return [
    `Proyecto: ${input.projectName}`,
    `Objetivo: ${a.objective}`,
    `Stack: ${describeStack(a.stack) || "sin definir"}${a.stack.extras?.length ? ` (extras: ${a.stack.extras.join(", ")})` : ""}`,
    `Fecha de entrega: ${input.deadline || "sin fecha"}`,
    "",
    "Requerimientos:",
    ...a.requirements.map((r) => `- ${r}`),
    "",
    "Tareas mencionadas en la minuta:",
    ...(a.mentionedTasks.length
      ? a.mentionedTasks.map((t) => `- ${t.title}${t.mentionedOwner ? ` (menciona a ${t.mentionedOwner})` : ""}`)
      : ["- ninguna"]),
    "",
    `Habilidades disponibles (usa solo estas en skill): ${skills.join(", ")}`,
    "Integrantes del equipo (solo como referencia para mentionedOwner):",
    members,
  ].join("\n");
}

async function saveTasks(projectId, modules, ordered) {
  await db.withTransaction(async (client) => {
    // Planear de nuevo reemplaza el tablero del proyecto.
    await client.query("DELETE FROM tasks WHERE project_id = $1", [projectId]);
    await client.query("DELETE FROM modules WHERE project_id = $1", [projectId]);

    const moduleIds = [];
    for (const [position, mod] of modules.entries()) {
      const { rows } = await client.query(
        "INSERT INTO modules (project_id, name, position) VALUES ($1, $2, $3) RETURNING id",
        [projectId, mod.name, position],
      );
      moduleIds.push(rows[0].id);
    }

    const lists = await board.ensureLists(client, projectId);
    const entry = board.entryList(lists);
    let first = lists.find(l => l.stage === "todo" && l.title === "Primeras tareas");
    if (!first) {
      const position = entry.position + 1;
      await client.query("UPDATE board_lists SET position = position + 1 WHERE project_id = $1 AND position >= $2", [projectId, position]);
      const { rows } = await client.query("INSERT INTO board_lists (project_id, title, stage, position) VALUES ($1, $2, 'todo', $3) RETURNING *", [projectId, "Primeras tareas", position]);
      first = rows[0];
    }

    const idByKey = new Map();
    for (const [position, t] of ordered.entries()) {
      const target = t.firstTask ? first : entry;
      const { rows } = await client.query(
        `INSERT INTO tasks (project_id, module_id, title, description, skill, assignee_id, priority,
                            estimate_hours, planned_start, planned_end, list_id, board_column, position, flags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $13, $14, $11, $12) RETURNING id`,
        [
          projectId,
          moduleIds[t.moduleIndex],
          t.title,
          t.description,
          t.skill,
          t.assigneeId,
          t.priority,
          t.estimateHours,
          t.plannedStart,
          t.plannedEnd,
          position,
          [...new Set(t.flags)],
          target.id,
          target.stage,
        ],
      );
      idByKey.set(t.key, rows[0].id);
      t.id = rows[0].id;
      for (const [criterionPosition, text] of t.acceptanceCriteria.entries()) {
        await client.query("INSERT INTO checklist_items (task_id, text, done, position) VALUES ($1, $2, FALSE, $3)", [t.id, text, criterionPosition]);
      }
    }

    for (const t of ordered) {
      for (const dep of t.dependsOn) {
        await client.query("INSERT INTO task_dependencies (task_id, depends_on_id) VALUES ($1, $2)", [
          idByKey.get(t.key),
          idByKey.get(dep),
        ]);
      }
    }
  });

  // Los tableros abiertos se recargan con el plan nuevo.
  await board.recordActivity({
    projectId,
    type: "plan_generated",
    message: `El Planificador creó ${ordered.length} tarjetas en ${modules.length} módulos`,
    data: { taskCount: ordered.length, moduleCount: modules.length },
  });
}

/** Texto de respaldo si el LLM no puede redactar la explicacion. */
function fallbackExplanation({ overloaded, finishDate, deadline, proposals }) {
  const parts = [];
  if (overloaded.length) parts.push(overloaded.map((o) => `${o.name} queda al ${o.percent}% de carga.`).join(" "));
  if (deadline && finishDate > deadline) parts.push(`El plan termina el ${finishDate} y la entrega es el ${deadline}.`);
  if (proposals.length) parts.push(`Propuestas: ${proposals.map((p) => p.message).join("; ")}.`);
  return parts.join(" ");
}

async function run(input, ctx) {
  if (input.members.length === 0) {
    throw new Error("El equipo no tiene miembros activos; agrega al menos uno antes de planear");
  }
  const startDate = nextWorkday(maxDate(input.startDate || clock.today(), clock.today()));
  const deadline = input.deadline;
  const skills = [...new Set(input.members.flatMap((m) => m.skills))].sort();

  // 1) El LLM desglosa
  ctx.progress("Desglosando el proyecto en modulos y tareas");
  const plan = await generateStructured({
    model: env.LLM_MODEL_SMART,
    fallbackModel: env.LLM_MODEL_FAST,
    system: SYSTEM,
    user: buildPrompt(input, skills),
    responseSchema: planGemini(skills),
    zodSchema: PlanSchema,
    temperature: 0.3,
    maxOutputTokens: 8192,
    mockKey: "planner",
    allowMock: !input.documentFilename,
    ctx,
  });

  const tasks = plan.modules.flatMap((mod, moduleIndex) =>
    mod.tasks.map((t) => ({ ...t, skill: t.skill.toLowerCase(), module: mod.name, moduleIndex, flags: [] })),
  );
  assertPlanGrounding(plan, input.analysis);

  // 2) El codigo asigna, calcula fechas y detecta riesgos
  ctx.progress("Asignando responsables segun la carga del equipo");
  const weeks = weeksUntil(startDate, deadline);
  // Capacidad sin los dias de ausencia; las fechas tambien se los saltan.
  const members = withAvailability(input.members, startDate, weeks);
  const { ordered } = assignTasks(tasks, members);
  const firstTasks = selectFirstTasks(ordered);
  for (const task of ordered) task.firstTask = firstTasks.has(task.key);
  const finishDate = scheduleTasks(
    ordered,
    members.map((m) => ({ id: m.id, weeklyHours: m.weeklyHours, busyHours: m.busyHours, blocked: m.blocked })),
    startDate,
  );
  const workload = workloadRows(members, weeks);
  const { atRisk, risks } = planRisks({ finishDate, deadline, workload, tasks: ordered });
  const proposals = proposeReassignments(ordered, members);
  const overloaded = workload
    .filter((w) => w.percent > 100)
    .map((w) => ({ memberId: w.memberId, name: w.name, percent: w.percent }));

  await saveTasks(input.projectId, plan.modules, ordered);

  // 3) Si hay riesgo, el LLM redacta la explicacion (si falla, va el texto fijo)
  const facts = { finishDate, deadline, overloaded, proposals, risks };
  let explanation = null;
  if (atRisk || proposals.length > 0) {
    ctx.progress("Redactando la explicacion de los riesgos");
    try {
      ({ explanation } = await generateStructured({
        model: env.LLM_MODEL_FAST,
        system: EXPLAIN_SYSTEM,
        user: `Datos del plan (JSON):\n${JSON.stringify(facts, null, 2)}`,
        responseSchema: ExplanationGemini,
        zodSchema: ExplanationSchema,
        temperature: 0.3,
        mockKey: "planExplanation",
        mockInput: facts,
        ctx,
      }));
    } catch (err) {
      console.warn(`[planner] No se pudo redactar la explicacion: ${err.message}`);
      explanation = fallbackExplanation(facts);
    }
  }

  const memberName = new Map(members.map((m) => [m.id, m.name]));
  let summary = `${ordered.length} tareas en ${plan.modules.length} modulos.`;
  summary += overloaded.length
    ? ` ${overloaded.map((o) => `${o.name} queda al ${o.percent}%`).join(", ")} de carga.`
    : " Nadie queda sobrecargado.";
  if (deadline && finishDate > deadline) summary += ` El plan termina el ${finishDate}, despues de la entrega.`;

  return {
    summary,
    moduleCount: plan.modules.length,
    taskCount: ordered.length,
    startDate,
    finishDate,
    deadline,
    atRisk,
    risks,
    workload,
    overloaded,
    proposals,
    explanation,
    tasks: ordered.map((t) => ({
      id: t.id,
      key: t.key,
      title: t.title,
      module: t.module,
      skill: t.skill,
      estimateHours: t.estimateHours,
      priority: t.priority,
      assignee: memberName.get(t.assigneeId),
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      dependsOn: t.dependsOn,
      acceptanceCriteria: t.acceptanceCriteria,
      column: t.firstTask ? "first-tasks" : "todo",
      flags: [...new Set(t.flags)],
    })),
  };
}

function isFirstTask(task) {
  return task.dependsOn.length === 0 && !task.flags.some(flag => ["dependencia_invalida", "dependencia_ciclica"].includes(flag));
}

function selectFirstTasks(tasks) {
  const selected = new Set();
  const counts = new Map();
  const priority = { high: 0, medium: 1, low: 2 };
  const candidates = tasks.filter(task => task.assigneeId && isFirstTask(task))
    .sort((a, b) => priority[a.priority] - priority[b.priority]);
  for (const task of candidates) {
    const count = counts.get(task.assigneeId) || 0;
    if (count >= 2) continue;
    selected.add(task.key);
    counts.set(task.assigneeId, count + 1);
  }
  return selected;
}

function assertPlanGrounding(plan, analysis) {
  const stack = analysis.stack || {};
  const source = [analysis.objective, ...(analysis.requirements || []), ...(analysis.mentionedTasks || []).map(t => t.title)].join(' ');
  const softwareRequested = /\b(software|aplicaci[oó]n|app|sitio web|p[aá]gina web|plataforma web|backend|frontend|api|postgres(?:ql)?|node(?:js)?|express|react)\b/i.test(source)
    || Boolean(stack.frontend || stack.backend || stack.database);
  if (softwareRequested) return;
  const unrelated = plan.modules.flatMap(m => m.tasks).find(t =>
    /\b(backend|frontend|api|postgres(?:ql)?|node(?:js)?|express|react|docker|base de datos)\b/i.test([t.title, t.description, ...(t.acceptanceCriteria || [])].join(' ')));
  if (unrelated) throw new Error(`El plan propuso una tarea técnica sin respaldo en el documento: "${unrelated.title}". No se guardó el plan; revisa el análisis y reintenta el Planificador.`);
}

module.exports = { run, isFirstTask, selectFirstTasks, assertPlanGrounding };

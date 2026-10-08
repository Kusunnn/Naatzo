// src/orchestrator/inputs.js
//
// Arma la entrada de cada agente a partir de la base: el proyecto y lo que
// guardaron los pasos anteriores de la misma ejecucion. Asi un reintento
// desde cualquier paso recibe exactamente lo mismo.

const db = require("../db");
const env = require("../config/env");
const { latestOutputs } = require("./store");
const { loadUnavailability } = require("../db/workload");

const boardUrl = (projectId) => `${env.FRONTEND_URL}/p/${projectId}/board`;
const zipUrl = (projectId) => `${env.API_PUBLIC_URL}/api/team/projects/${projectId}/environment/zip`;

function requireOutput(outputs, agent) {
  if (!outputs[agent]) {
    const err = new Error(`No hay salida guardada del paso ${agent}; reintenta desde ese paso`);
    err.status = 400;
    throw err;
  }
  return outputs[agent];
}

/** Miembros activos con las horas que ya tienen comprometidas en otros proyectos. */
async function loadMembers(teamId, projectId) {
  const { rows } = await db.query(
    `SELECT m.id, m.name, m.role, m.skills, m.weekly_hours,
            COALESCE(SUM(k.estimate_hours) FILTER (
              WHERE k.board_column <> 'done' AND k.archived_at IS NULL AND k.project_id <> $2), 0) AS other_hours
     FROM members m
     LEFT JOIN tasks k ON k.assignee_id = m.id
     WHERE m.team_id = $1 AND m.active
     GROUP BY m.id
     ORDER BY m.created_at, m.name`,
    [teamId, projectId],
  );
  const absences = await loadUnavailability(rows.map((m) => m.id));
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    skills: m.skills,
    weeklyHours: Number(m.weekly_hours),
    otherProjectsHours: Number(m.other_hours),
    unavailability: absences.get(m.id).map(({ startDate, endDate }) => ({ startDate, endDate })),
  }));
}

/** Modulos con sus tareas y responsables, para el README y docs/TAREAS.md. */
async function loadModules(projectId) {
  const { rows } = await db.query(
    `SELECT md.name AS module, md.position, k.title, k.priority, k.estimate_hours,
            k.planned_start, k.planned_end, mb.name AS assignee
     FROM modules md
     LEFT JOIN tasks k ON k.module_id = md.id AND k.archived_at IS NULL
     LEFT JOIN members mb ON mb.id = k.assignee_id
     WHERE md.project_id = $1
     ORDER BY md.position, k.planned_start NULLS LAST, k.title`,
    [projectId],
  );
  const modules = [];
  for (const r of rows) {
    let mod = modules.find((m) => m.name === r.module);
    if (!mod) {
      mod = { name: r.module, tasks: [] };
      modules.push(mod);
    }
    if (r.title) {
      mod.tasks.push({
        title: r.title,
        priority: r.priority,
        estimateHours: Number(r.estimate_hours),
        plannedStart: r.planned_start,
        plannedEnd: r.planned_end,
        assignee: r.assignee,
      });
    }
  }
  return modules;
}

async function loadInputFor(runId, step) {
  const { rows } = await db.query(
    "SELECT p.*, u.name AS author_name, t.owner_id AS owner_user_id FROM runs r JOIN projects p ON p.id = r.project_id JOIN teams t ON t.id=p.team_id JOIN public.naatzo_users u ON u.id=t.owner_id WHERE r.id = $1",
    [runId],
  );
  const project = rows[0];
  const base = { projectId: project.id, projectName: project.name, documentFilename: project.input_filename, ownerUserId: project.owner_user_id };
  const outputs = await latestOutputs(runId);

  switch (step) {
    case "analyst":
      return { ...base, text: project.input_text, authorName: project.author_name, documentFilename: project.input_filename };

    case "planner": {
      const { analysis } = requireOutput(outputs, "analyst");
      return {
        ...base,
        teamId: project.team_id,
        analysis,
        startDate: project.start_date,
        // La fecha que se puso al crear el proyecto manda sobre la de la minuta.
        deadline: project.deadline || analysis.deadline || null,
        members: await loadMembers(project.team_id, project.id),
      };
    }

    case "devops": {
      const { analysis } = requireOutput(outputs, "analyst");
      requireOutput(outputs, "planner");
      return { ...base, analysis, modules: await loadModules(project.id) };
    }

    case "notifier": {
      const { analysis } = requireOutput(outputs, "analyst");
      const plan = requireOutput(outputs, "planner");
      const devops = requireOutput(outputs, "devops");
      return {
        ...base,
        objective: analysis.objective,
        boardUrl: boardUrl(project.id),
        repoUrl: devops.repoUrl || null,
        teams: devops.teams || null,
        zipUrl: devops.zipUrl || (devops.repoUrl ? null : zipUrl(project.id)),
        plan: {
          taskCount: plan.taskCount,
          moduleCount: plan.moduleCount,
          overloaded: plan.overloaded || [],
          proposals: plan.proposals || [],
          atRisk: plan.atRisk || false,
          finishDate: plan.finishDate || null,
          deadline: plan.deadline || null,
        },
      };
    }

    default:
      throw new Error(`Paso desconocido: ${step}`);
  }
}

module.exports = { loadInputFor, loadMembers, boardUrl, zipUrl };

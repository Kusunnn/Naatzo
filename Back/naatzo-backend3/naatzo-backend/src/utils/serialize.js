// src/utils/serialize.js
// Convierte filas de la base (snake_case) a la forma que ve el frontend.

const num = (v) => (v === null || v === undefined ? null : Number(v));
// db/index.js hace que las columnas DATE lleguen como "YYYY-MM-DD"
const day = (v) => (v ? String(v).slice(0, 10) : null);

function member(m) {
  return {
    id: m.id,
    teamId: m.team_id,
    name: m.name,
    role: m.role,
    skills: m.skills,
    weeklyHours: num(m.weekly_hours),
    contact: m.contact,
    active: m.active,
  };
}

function project(p) {
  return {
    id: p.id,
    teamId: p.team_id,
    name: p.name,
    status: p.status,
    startDate: day(p.start_date),
    deadline: day(p.deadline),
    inputFilename: p.input_filename ?? null,
    repoUrl: p.repo_url,
    externalBoardUrl: p.external_board_url,
    analysis: p.analysis,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function run(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    status: r.status,
    currentStep: r.current_step,
    requireApproval: r.require_approval,
    error: r.error,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}

module.exports = { num, day, member, project, run };

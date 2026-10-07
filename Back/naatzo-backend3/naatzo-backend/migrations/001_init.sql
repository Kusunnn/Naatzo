-- 001_init.sql
-- Modelo de datos de Naatzo (seccion 9 del documento tecnico).
-- Nombres en ingles y snake_case. gen_random_uuid() viene en Postgres 13+.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX teams_owner_idx ON teams (owner_id);

-- Personas a las que se asignan tareas. No necesitan cuenta en Naatzo.
CREATE TABLE members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT '',
  skills       TEXT[] NOT NULL DEFAULT '{}',
  weekly_hours NUMERIC(5,1) NOT NULL DEFAULT 20 CHECK (weekly_hours > 0 AND weekly_hours <= 80),
  contact      JSONB NOT NULL DEFAULT '{}',
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX members_team_idx ON members (team_id);

-- Un proyecto por minuta.
CREATE TABLE projects (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  input_text         TEXT NOT NULL,
  analysis           JSONB,
  start_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  deadline           DATE,
  repo_url           TEXT,
  external_board_url TEXT,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','running','awaiting_approval','active','failed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX projects_team_idx ON projects (team_id);

-- Cada corrida de la cadena de agentes.
CREATE TABLE runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','analyzing','planning','awaiting_approval',
                                     'provisioning','notifying','completed','failed','cancelled')),
  current_step     TEXT,
  require_approval BOOLEAN NOT NULL DEFAULT TRUE,
  error            TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ
);
CREATE INDEX runs_project_idx ON runs (project_id, started_at DESC);

-- La traza: que recibio y que decidio cada agente.
CREATE TABLE agent_steps (
  id            BIGSERIAL PRIMARY KEY,
  run_id        UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  agent         TEXT NOT NULL CHECK (agent IN ('analyst','planner','devops','notifier')),
  status        TEXT NOT NULL CHECK (status IN ('started','done','failed')),
  input         JSONB,
  output        JSONB,
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX agent_steps_run_idx ON agent_steps (run_id, created_at);

CREATE TABLE modules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX modules_project_idx ON modules (project_id, position);

-- Tarjetas del Kanban. La columna se llama board_column porque column es
-- palabra reservada en SQL.
CREATE TABLE tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id      UUID REFERENCES modules(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  skill          TEXT,
  assignee_id    UUID REFERENCES members(id) ON DELETE SET NULL,
  priority       TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  estimate_hours NUMERIC(5,1) CHECK (estimate_hours > 0 AND estimate_hours <= 40),
  planned_start  DATE,
  planned_end    DATE,
  board_column   TEXT NOT NULL DEFAULT 'todo'
                 CHECK (board_column IN ('todo','in_progress','review','done')),
  position       INTEGER NOT NULL DEFAULT 0,
  flags          TEXT[] NOT NULL DEFAULT '{}',
  external_id    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX tasks_board_idx ON tasks (project_id, board_column, position);
CREATE INDEX tasks_assignee_idx ON tasks (assignee_id);

CREATE TABLE task_dependencies (
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);

-- Archivos que creo DevOps (vista previa y ZIP).
CREATE TABLE generated_files (
  id         BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  content    TEXT NOT NULL,
  UNIQUE (project_id, path)
);

-- Webhooks y tokens por equipo, cifrados con AES-256-GCM (despues del MVP;
-- en el MVP salen del .env).
CREATE TABLE integrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  type             TEXT NOT NULL,
  config_encrypted TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, type)
);

-- Historial de avisos y control de duplicados (dedupe_key = tarea:motivo:dia).
CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id    UUID REFERENCES tasks(id) ON DELETE SET NULL,
  channel    TEXT NOT NULL,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
  error      TEXT,
  dedupe_key TEXT UNIQUE,
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX notifications_project_idx ON notifications (project_id, created_at DESC);

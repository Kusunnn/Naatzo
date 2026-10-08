-- 004_board.sql
-- Tablero propio estilo Trello: listas configurables, etiquetas, checklist,
-- comentarios, tarjetas archivadas y actividad.
--
-- Cada lista tiene una etapa (stage). La tarjeta guarda en board_column la
-- etapa de su lista, asi la carga, los riesgos y el cron siguen funcionando
-- aunque el equipo invente sus propias listas.

CREATE TABLE board_lists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  stage      TEXT NOT NULL CHECK (stage IN ('todo','in_progress','review','done')),
  position   INTEGER NOT NULL DEFAULT 0,
  wip_limit  INTEGER CHECK (wip_limit > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX board_lists_project_idx ON board_lists (project_id, position);

-- Listas por defecto para los proyectos que ya existen.
INSERT INTO board_lists (project_id, title, stage, position)
SELECT p.id, v.title, v.stage, v.position
FROM projects p
CROSS JOIN (VALUES ('Por hacer', 'todo', 0), ('En progreso', 'in_progress', 1),
                   ('En revisión', 'review', 2), ('Hecho', 'done', 3)) AS v(title, stage, position);

-- Cada tarjeta vive en una lista. Para borrar una lista primero se mueven sus tarjetas.
ALTER TABLE tasks ADD COLUMN list_id UUID REFERENCES board_lists(id) ON DELETE RESTRICT;
ALTER TABLE tasks ADD COLUMN archived_at TIMESTAMPTZ;
UPDATE tasks k SET list_id = l.id
FROM board_lists l
WHERE l.project_id = k.project_id AND l.stage = k.board_column;
ALTER TABLE tasks ALTER COLUMN list_id SET NOT NULL;
CREATE INDEX tasks_list_idx ON tasks (list_id, position) WHERE archived_at IS NULL;

CREATE TABLE labels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE TABLE task_labels (
  task_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

CREATE TABLE checklist_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT FALSE,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX checklist_items_task_idx ON checklist_items (task_id, position);

CREATE TABLE task_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX task_comments_task_idx ON task_comments (task_id, created_at);

-- Historial del tablero: quien movio, asigno o comento que.
CREATE TABLE board_activity (
  id         BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id    UUID REFERENCES tasks(id) ON DELETE SET NULL,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX board_activity_project_idx ON board_activity (project_id, created_at DESC);

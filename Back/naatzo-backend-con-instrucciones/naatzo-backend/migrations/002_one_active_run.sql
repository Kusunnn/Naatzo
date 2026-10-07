-- 002_one_active_run.sql
-- Una sola ejecucion viva por proyecto, garantizado por la base aunque
-- lleguen dos peticiones al mismo tiempo.
CREATE UNIQUE INDEX runs_one_active_per_project
  ON runs (project_id)
  WHERE status IN ('queued','analyzing','planning','awaiting_approval','provisioning','notifying');

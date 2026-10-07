-- 009_run_mode.sql
-- Dos modos de ejecucion:
--   automatic:  corre de punta a punta sin intervencion humana; si el plan tiene
--               riesgos, avisa (correo al dueno, evento en vivo y actividad).
--   supervised: se detiene antes de DevOps hasta que el dueno aprueba.
-- Reemplaza a require_approval.
ALTER TABLE runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'automatic'
  CHECK (mode IN ('automatic', 'supervised'));
UPDATE runs SET mode = CASE WHEN require_approval THEN 'supervised' ELSE 'automatic' END;
ALTER TABLE runs DROP COLUMN require_approval;

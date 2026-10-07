-- 003_demo_flag.sql
-- Marca los equipos que crea POST /api/demo/seed, para que
-- POST /api/demo/reset borre solo esos y nunca datos reales.
ALTER TABLE teams ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;

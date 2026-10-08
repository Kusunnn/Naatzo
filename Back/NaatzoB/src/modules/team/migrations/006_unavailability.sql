-- 006_unavailability.sql
-- Dias en que un miembro no puede trabajar ("Ana no puede esta semana").
-- La asignacion y las fechas se los saltan, y la capacidad se descuenta.
CREATE TABLE member_unavailability (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL CHECK (end_date >= start_date),
  reason     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX member_unavailability_member_idx ON member_unavailability (member_id, start_date);

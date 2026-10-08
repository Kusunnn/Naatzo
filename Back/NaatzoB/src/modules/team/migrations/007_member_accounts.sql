-- 007_member_accounts.sql
-- Cuentas para los miembros: un usuario de Naatzo se liga a un miembro del
-- equipo (por invitacion) y entra al tablero con su propio login.

ALTER TABLE members ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
-- Un usuario es a lo mas un miembro por equipo.
CREATE UNIQUE INDEX members_team_user_idx ON members (team_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX members_user_idx ON members (user_id);

-- Invitaciones a un miembro concreto ("Laura"). El codigo se guarda solo como
-- hash (sha256): quien tiene el codigo puede aceptar, pero la base no lo revela.
CREATE TABLE team_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL UNIQUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX team_invitations_member_idx ON team_invitations (member_id);

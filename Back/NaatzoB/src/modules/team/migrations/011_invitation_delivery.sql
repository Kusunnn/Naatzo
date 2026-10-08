ALTER TABLE team_invitations ADD COLUMN recipient_email TEXT;
ALTER TABLE team_invitations ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (delivery_status IN ('pending', 'sent', 'not_configured', 'failed'));
ALTER TABLE team_invitations ADD COLUMN delivery_error TEXT;

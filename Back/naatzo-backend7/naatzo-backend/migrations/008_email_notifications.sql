-- 008_email_notifications.sql
-- Los avisos ahora salen por correo: se guarda el asunto y a quien se mando.
ALTER TABLE notifications ADD COLUMN subject TEXT;
ALTER TABLE notifications ADD COLUMN recipients TEXT[] NOT NULL DEFAULT '{}';

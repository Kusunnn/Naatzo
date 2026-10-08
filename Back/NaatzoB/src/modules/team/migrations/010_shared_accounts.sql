-- Una cuenta canónica. users_legacy solo conserva un respaldo de la migración.
INSERT INTO public.naatzo_users (id, name, email, password_hash, created_at)
SELECT id, name, LOWER(email), password_hash, created_at FROM users
ON CONFLICT (LOWER(email)) DO NOTHING;

DO $$
DECLARE
  fk RECORD;
  column_name TEXT;
  definition TEXT;
BEGIN
  FOR fk IN
    SELECT c.oid, c.conname, c.conrelid, c.conkey FROM pg_constraint c
    WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
      AND c.connamespace = current_schema()::regnamespace
  LOOP
    IF array_length(fk.conkey, 1) <> 1 THEN
      RAISE EXCEPTION 'Referencia compuesta inesperada: %', fk.conname;
    END IF;
    SELECT attname INTO column_name FROM pg_attribute
      WHERE attrelid = fk.conrelid AND attnum = fk.conkey[1];
    definition := regexp_replace(pg_get_constraintdef(fk.oid),
      'REFERENCES [^ (]+\(', 'REFERENCES public.naatzo_users(');
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.conrelid::regclass, fk.conname);
    EXECUTE format(
      'UPDATE %s target SET %I = canonical.id FROM users legacy
       JOIN public.naatzo_users canonical ON LOWER(canonical.email) = LOWER(legacy.email)
       WHERE target.%I = legacy.id', fk.conrelid::regclass, column_name, column_name);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.conrelid::regclass, fk.conname, definition);
  END LOOP;
END $$;

ALTER TABLE users RENAME TO users_legacy;

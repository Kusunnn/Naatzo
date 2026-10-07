-- Preserve existing accounts when upgrading to Naatzo.
DO $$
BEGIN
  IF to_regclass('public.kibo_users') IS NOT NULL
     AND to_regclass('public.naatzo_users') IS NULL THEN
    ALTER TABLE public.kibo_users RENAME TO naatzo_users;
  END IF;
  IF to_regclass('public.kibo_users_email_lower_idx') IS NOT NULL
     AND to_regclass('public.naatzo_users_email_lower_idx') IS NULL THEN
    ALTER INDEX public.kibo_users_email_lower_idx RENAME TO naatzo_users_email_lower_idx;
  END IF;
END $$;

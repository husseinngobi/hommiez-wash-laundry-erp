-- Limit temporary credentials issued by user management to three login attempts.
-- This schema is shared by all tenants; normal password changes reset the counter.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS temporary_password_login_attempts INTEGER NOT NULL DEFAULT 0;

UPDATE public.users
SET temporary_password_login_attempts = 0
WHERE temporary_password_login_attempts IS NULL;

ALTER TABLE public.users
  ALTER COLUMN temporary_password_login_attempts SET DEFAULT 0,
  ALTER COLUMN temporary_password_login_attempts SET NOT NULL;

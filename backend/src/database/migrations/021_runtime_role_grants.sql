-- Create a dedicated runtime role that is subject to row-level security.
-- Run with the migration/admin role only after 020 has enabled tenant policies.
-- Set a strong password outside source control, then configure APP_DATABASE_URL
-- with the Supabase shared-pooler username `lush_app.<project-ref>`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lush_app') THEN
    CREATE ROLE lush_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSE
    ALTER ROLE lush_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO lush_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lush_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO lush_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO lush_app;

-- The application may validate tenants, but tenant lifecycle is admin-only.
REVOKE SELECT ON public.tenants FROM lush_app;
GRANT SELECT (id, is_active) ON public.tenants TO lush_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.tenants FROM lush_app;

-- Migration bookkeeping is not part of the application API.
REVOKE ALL ON public.schema_patches FROM lush_app;

-- Preserve the same grants on new objects created by the postgres migration owner.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lush_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO lush_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO lush_app;

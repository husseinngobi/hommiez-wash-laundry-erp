-- Create per-user notification preferences with tenant isolation.
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_preferences (
  tenant_id INTEGER NOT NULL DEFAULT app_current_tenant_id()
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  desktop_notifications BOOLEAN NOT NULL DEFAULT FALSE,
  sound_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  in_app_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_preferences_pkey PRIMARY KEY (tenant_id, user_id)
);

-- Seed only each user's own tenant row; tenant 2 remains empty until it has users.
INSERT INTO public.user_preferences (
  tenant_id, user_id, email_notifications, desktop_notifications,
  sound_alerts, in_app_notifications
)
SELECT tenant_id, id, TRUE, FALSE, FALSE, TRUE
FROM public.users
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- user IDs are globally unique, so preserve the legacy conflict target during
-- rollout while the backend switches to the composite tenant key.
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_user_id_legacy_key
  ON public.user_preferences (user_id);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_preferences_tenant_isolation_policy
  ON public.user_preferences;
CREATE POLICY user_preferences_tenant_isolation_policy
  ON public.user_preferences
  TO lush_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO lush_app;

COMMIT;

-- Let the restricted runtime role validate only its deployment's tenant.
-- Tenant-scoped business tables use app_current_tenant_id(); this policy reads
-- the request's transaction-local setting directly to avoid recursive policy
-- evaluation on the global tenants table.

DROP POLICY IF EXISTS tenants_runtime_read_own_policy ON public.tenants;

CREATE POLICY tenants_runtime_read_own_policy
  ON public.tenants
  FOR SELECT
  TO lush_app
  USING (
    id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
  );

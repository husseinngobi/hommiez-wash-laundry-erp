-- Tenant data isolation hardening.
-- Apply manually with the database migration/admin role after reviewing the
-- data counts. Existing business records are assigned to the default tenant
-- (Lush, tenant 1); no business records are copied to tenant 2.

BEGIN;

DO $$
DECLARE
  table_name TEXT;
  constraint_name TEXT;
  policy_name TEXT;
  tenant_tables TEXT[] := ARRAY[
    'users', 'customers', 'price_items', 'orders', 'order_items', 'payments',
    'pending_payments', 'payment_refunds', 'payment_refund_requests',
    'inventory_items', 'inventory_transactions', 'notifications',
    'user_preferences', 'announcements', 'promotions', 'delivery_drivers',
    'delivery_zones', 'deliveries', 'business_settings', 'automation_settings',
    'expenses', 'expense_categories', 'payroll_employees', 'salary_payments',
    'fiscal_years', 'year_end_snapshots', 'audit_logs', 'activity_logs',
    'automated_backup_dates', 'backup_attempts', 'backup_email_settings', 'backup_history', 'branches', 'damage_claims',
    'notification_reads', 'order_deletions', 'password_reset_requests',
    'period_comparisons', 'refund_requests', 'whatsapp_messages'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id INTEGER', table_name);
    EXECUTE format(
      'UPDATE public.%I SET tenant_id = COALESCE(tenant_id, get_default_tenant_id())',
      table_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT app_current_tenant_id()',
      table_name
    );
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', table_name);

    constraint_name := format('%s_tenant_id_fkey', table_name);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = constraint_name
        AND conrelid = to_regclass(format('public.%I', table_name))
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT',
        table_name,
        constraint_name
      );
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
      format('idx_%s_tenant_id', table_name),
      table_name
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    policy_name := format('%s_tenant_isolation_policy', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id())',
      policy_name,
      table_name
    );
  END LOOP;
END;
$$;

-- Add tenant-aware keys first. Migration 018 removes the old global keys only
-- after the updated backend is deployed with these conflict targets.
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_key
  ON public.users (tenant_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_google_id_key
  ON public.users (tenant_id, google_id) WHERE google_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_customer_id_key
  ON public.customers (tenant_id, customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS pending_payments_tenant_transaction_reference_key
  ON public.pending_payments (tenant_id, transaction_reference)
  WHERE transaction_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_order_number_key
  ON public.orders (tenant_id, order_number);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_tenant_item_name_key
  ON public.inventory_items (tenant_id, item_name);
CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_tenant_name_key
  ON public.expense_categories (tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_zones_tenant_zone_code_key
  ON public.delivery_zones (tenant_id, zone_code);
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_years_tenant_period_key
  ON public.fiscal_years (tenant_id, start_date, end_date);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_employees_tenant_employee_number_key
  ON public.payroll_employees (tenant_id, employee_id_number);
CREATE UNIQUE INDEX IF NOT EXISTS branches_tenant_code_key
  ON public.branches (tenant_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS automated_backup_dates_tenant_date_key
  ON public.automated_backup_dates (tenant_id, backup_date);
CREATE UNIQUE INDEX IF NOT EXISTS backup_email_settings_tenant_key
  ON public.backup_email_settings (tenant_id);

-- These views join tenant tables. Use invoker permissions so underlying RLS
-- policies apply to the request role rather than the view owner.
ALTER VIEW IF EXISTS public.current_fiscal_year SET (security_invoker = true);
ALTER VIEW IF EXISTS public.pending_refund_requests SET (security_invoker = true);
ALTER VIEW IF EXISTS public.refund_summary SET (security_invoker = true);

COMMIT;

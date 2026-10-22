-- Phase 1 of tenant-scoped configuration/catalog support.
-- Apply this migration before deploying code that targets the new unique keys.
-- Existing global unique indexes remain temporarily for a safe rolling deploy.

BEGIN;

-- New rows should inherit the tenant selected for the current request, not always Lush.
DO $$
DECLARE
  current_table TEXT;
  tenant_tables TEXT[] := ARRAY[
    'users', 'customers', 'price_items', 'orders', 'order_items', 'payments',
    'pending_payments', 'payment_refunds', 'payment_refund_requests',
    'inventory_items', 'inventory_transactions', 'notifications',
    'user_preferences', 'announcements', 'promotions', 'delivery_drivers',
    'delivery_zones', 'deliveries', 'business_settings', 'automation_settings',
    'expenses', 'expense_categories', 'payroll_employees', 'salary_payments',
    'fiscal_years', 'year_end_snapshots', 'audit_logs'
  ];
BEGIN
  FOREACH current_table IN ARRAY tenant_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS c
      WHERE c.table_schema = 'public'
        AND c.table_name = current_table
        AND c.column_name = 'tenant_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT app_current_tenant_id()',
        current_table
      );
    END IF;
  END LOOP;
END;
$$;

-- Add tenant-aware keys while retaining legacy global keys during app rollout.
CREATE UNIQUE INDEX IF NOT EXISTS business_settings_tenant_setting_key_key
  ON public.business_settings (tenant_id, setting_key);

CREATE UNIQUE INDEX IF NOT EXISTS automation_settings_tenant_setting_key_key
  ON public.automation_settings (tenant_id, setting_key);

CREATE UNIQUE INDEX IF NOT EXISTS price_items_tenant_item_id_key
  ON public.price_items (tenant_id, item_id);

COMMIT;

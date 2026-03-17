-- Multi-tenant foundation for shared Supabase database
-- Safe defaults keep current Lush Laundry behavior unchanged.

CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  tenant_name VARCHAR(255) NOT NULL,
  tenant_slug VARCHAR(120) NOT NULL UNIQUE,
  contact_email VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_single_default
  ON tenants ((is_default))
  WHERE is_default = TRUE;

INSERT INTO tenants (tenant_name, tenant_slug, contact_email, is_default)
VALUES ('Lush Laundry ERP', 'lush-laundry', 'admin@lushlaundry.com', TRUE)
ON CONFLICT (tenant_slug) DO UPDATE
SET is_default = TRUE,
    updated_at = CURRENT_TIMESTAMP;

CREATE OR REPLACE FUNCTION get_default_tenant_id()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  default_tenant_id INTEGER;
BEGIN
  SELECT id INTO default_tenant_id
  FROM tenants
  WHERE is_default = TRUE
  ORDER BY id ASC
  LIMIT 1;

  IF default_tenant_id IS NULL THEN
    INSERT INTO tenants (tenant_name, tenant_slug, contact_email, is_default)
    VALUES ('Lush Laundry ERP', 'lush-laundry', 'admin@lushlaundry.com', TRUE)
    RETURNING id INTO default_tenant_id;
  END IF;

  RETURN default_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_current_tenant_id()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  tenant_setting TEXT;
BEGIN
  tenant_setting := current_setting('app.current_tenant_id', TRUE);

  IF tenant_setting IS NOT NULL AND tenant_setting ~ '^[0-9]+$' THEN
    RETURN tenant_setting::INTEGER;
  END IF;

  RETURN get_default_tenant_id();
END;
$$;

DO $$
DECLARE
  table_name TEXT;
  constraint_name TEXT;
  policy_name TEXT;
  tenant_tables TEXT[] := ARRAY[
    'users',
    'customers',
    'price_items',
    'orders',
    'order_items',
    'payments',
    'pending_payments',
    'payment_refunds',
    'payment_refund_requests',
    'inventory_items',
    'inventory_transactions',
    'notifications',
    'user_preferences',
    'announcements',
    'promotions',
    'delivery_drivers',
    'delivery_zones',
    'deliveries',
    'business_settings',
    'automation_settings',
    'expenses',
    'expense_categories',
    'payroll_employees',
    'salary_payments',
    'fiscal_years',
    'year_end_snapshots',
    'audit_logs'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables
  LOOP
    IF to_regclass(table_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id INTEGER', table_name);
    EXECUTE format('UPDATE %I SET tenant_id = COALESCE(tenant_id, get_default_tenant_id())', table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT get_default_tenant_id()', table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', table_name);

    constraint_name := format('%s_tenant_id_fkey', table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = constraint_name
        AND conrelid = to_regclass(table_name)
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
        table_name,
        constraint_name
      );
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)',
      format('idx_%s_tenant_id', table_name),
      table_name
    );

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);

    policy_name := format('%s_tenant_isolation_policy', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id())',
      policy_name,
      table_name
    );
  END LOOP;
END;
$$;

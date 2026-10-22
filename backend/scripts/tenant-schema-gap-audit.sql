-- Read-only Supabase audit for remaining multi-tenant schema gaps.
-- Run each SELECT separately in Supabase SQL Editor and share every result.
-- `tenants` is intentionally excluded: it is the shared tenant registry.

-- 1. Public application tables that do not have tenant_id.
SELECT t.table_name
FROM information_schema.tables AS t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name <> 'tenants'
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = t.table_schema
      AND c.table_name = t.table_name
      AND c.column_name = 'tenant_id'
  )
ORDER BY t.table_name;

-- 2. Every unique index on a tenant-scoped table. Review any index whose
-- columns do not include tenant_id: it may prevent tenants sharing a key.
SELECT i.tablename, i.indexname, i.indexdef
FROM pg_indexes AS i
WHERE i.schemaname = 'public'
  AND i.indexdef ILIKE 'CREATE UNIQUE INDEX%'
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = i.schemaname
      AND c.table_name = i.tablename
      AND c.column_name = 'tenant_id'
  )
ORDER BY i.tablename, i.indexname;

-- 3. Row-level security status and policies. Policies alone do not protect
-- rows when the application connects as a superuser or BYPASSRLS role.
SELECT
  c.relname AS table_name,
  pg_get_userbyid(c.relowner) AS table_owner,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  p.polname AS policy_name,
  pg_get_expr(p.polqual, p.polrelid) AS using_expression,
  pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_policy AS p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND EXISTS (
    SELECT 1 FROM information_schema.columns AS col
    WHERE col.table_schema = 'public'
      AND col.table_name = c.relname
      AND col.column_name = 'tenant_id'
  )
ORDER BY c.relname, p.polname;

-- 4. Role used by this SQL session and whether it bypasses row security.
-- This reports the SQL Editor role, not necessarily the backend's DB role.
SELECT current_user AS audit_session_role, r.rolsuper, r.rolbypassrls
FROM pg_roles AS r
WHERE r.rolname = current_user;

-- 5. Columns on the remaining four tables whose details were cut off by the
-- SQL Editor's 100-row display limit. Run this SELECT by itself.
SELECT table_name, ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'period_comparisons', 'refund_requests', 'schema_patches', 'whatsapp_messages'
  )
ORDER BY table_name, ordinal_position;

-- 6. Exact read-only counts for the tables currently missing tenant_id.
SELECT 'activity_logs' AS table_name, COUNT(*) AS row_count FROM public.activity_logs
UNION ALL SELECT 'automated_backup_dates', COUNT(*) FROM public.automated_backup_dates
UNION ALL SELECT 'backup_attempts', COUNT(*) FROM public.backup_attempts
UNION ALL SELECT 'backup_email_settings', COUNT(*) FROM public.backup_email_settings
UNION ALL SELECT 'backup_history', COUNT(*) FROM public.backup_history
UNION ALL SELECT 'branches', COUNT(*) FROM public.branches
UNION ALL SELECT 'damage_claims', COUNT(*) FROM public.damage_claims
UNION ALL SELECT 'notification_reads', COUNT(*) FROM public.notification_reads
UNION ALL SELECT 'order_deletions', COUNT(*) FROM public.order_deletions
UNION ALL SELECT 'password_reset_requests', COUNT(*) FROM public.password_reset_requests
UNION ALL SELECT 'period_comparisons', COUNT(*) FROM public.period_comparisons
UNION ALL SELECT 'refund_requests', COUNT(*) FROM public.refund_requests
UNION ALL SELECT 'schema_patches', COUNT(*) FROM public.schema_patches
UNION ALL SELECT 'whatsapp_messages', COUNT(*) FROM public.whatsapp_messages
ORDER BY table_name;

-- 7. Unique indexes on tables still missing tenant_id. Review before adding
-- tenant-aware unique indexes; primary-key id indexes can stay global.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
  AND tablename IN (
    'activity_logs', 'automated_backup_dates', 'backup_attempts',
    'backup_email_settings', 'backup_history', 'branches', 'damage_claims',
    'notification_reads', 'order_deletions', 'password_reset_requests',
    'period_comparisons', 'refund_requests', 'schema_patches', 'whatsapp_messages'
  )
ORDER BY tablename, indexname;

-- 8. Active client connection roles. First make a request in the deployed app,
-- then run this query to see whether its DB role is distinguishable from SQL Editor.
-- If only the SQL Editor role appears, check DB_USER in the hosting environment.
SELECT
  usename AS database_user,
  application_name,
  state,
  COUNT(*) AS connection_count
FROM pg_stat_activity
WHERE datname = current_database()
  AND backend_type = 'client backend'
  AND pid <> pg_backend_pid()
GROUP BY usename, application_name, state
ORDER BY connection_count DESC, database_user, application_name;

-- 9. After tenant isolation is in place, verify row ownership. Tenant 2 should
-- be empty until its first user and business data are intentionally added.
SELECT 'activity_logs' AS table_name,
       COUNT(*) FILTER (WHERE tenant_id = 1) AS tenant_1_rows,
       COUNT(*) FILTER (WHERE tenant_id = 2) AS tenant_2_rows
FROM public.activity_logs
UNION ALL SELECT 'audit_logs', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.audit_logs
UNION ALL SELECT 'automated_backup_dates', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.automated_backup_dates
UNION ALL SELECT 'backup_attempts', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.backup_attempts
UNION ALL SELECT 'backup_email_settings', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.backup_email_settings
UNION ALL SELECT 'backup_history', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.backup_history
UNION ALL SELECT 'branches', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.branches
UNION ALL SELECT 'business_settings', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.business_settings
UNION ALL SELECT 'customers', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.customers
UNION ALL SELECT 'damage_claims', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.damage_claims
UNION ALL SELECT 'deliveries', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.deliveries
UNION ALL SELECT 'delivery_drivers', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.delivery_drivers
UNION ALL SELECT 'delivery_zones', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.delivery_zones
UNION ALL SELECT 'expense_categories', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.expense_categories
UNION ALL SELECT 'expenses', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.expenses
UNION ALL SELECT 'fiscal_years', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.fiscal_years
UNION ALL SELECT 'inventory_items', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.inventory_items
UNION ALL SELECT 'inventory_transactions', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.inventory_transactions
UNION ALL SELECT 'notification_reads', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.notification_reads
UNION ALL SELECT 'notifications', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.notifications
UNION ALL SELECT 'order_deletions', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.order_deletions
UNION ALL SELECT 'order_items', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.order_items
UNION ALL SELECT 'orders', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.orders
UNION ALL SELECT 'password_reset_requests', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.password_reset_requests
UNION ALL SELECT 'payments', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.payments
UNION ALL SELECT 'payroll_employees', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.payroll_employees
UNION ALL SELECT 'pending_payments', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.pending_payments
UNION ALL SELECT 'period_comparisons', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.period_comparisons
UNION ALL SELECT 'price_items', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.price_items
UNION ALL SELECT 'promotions', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.promotions
UNION ALL SELECT 'refund_requests', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.refund_requests
UNION ALL SELECT 'salary_payments', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.salary_payments
UNION ALL SELECT 'users', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.users
UNION ALL SELECT 'whatsapp_messages', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.whatsapp_messages
UNION ALL SELECT 'year_end_snapshots', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.year_end_snapshots
UNION ALL SELECT 'automation_settings', COUNT(*) FILTER (WHERE tenant_id = 1), COUNT(*) FILTER (WHERE tenant_id = 2) FROM public.automation_settings
ORDER BY table_name;

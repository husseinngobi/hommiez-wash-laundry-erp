-- Phase 2: apply only after the updated backend is deployed with tenant-scoped
-- keys. This preserves compatibility while old and new backend versions overlap.

BEGIN;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_setting_key_key;
DROP INDEX IF EXISTS public.business_settings_setting_key_key;

ALTER TABLE public.automation_settings
  DROP CONSTRAINT IF EXISTS automation_settings_setting_key_key;
DROP INDEX IF EXISTS public.automation_settings_setting_key_key;

ALTER TABLE public.price_items
  DROP CONSTRAINT IF EXISTS price_items_item_id_key;
DROP INDEX IF EXISTS public.price_items_item_id_key;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS public.users_email_key;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_google_id_key;
DROP INDEX IF EXISTS public.users_google_id_key;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_customer_id_key;
DROP INDEX IF EXISTS public.customers_customer_id_key;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_number_key;
DROP INDEX IF EXISTS public.orders_order_number_key;
ALTER TABLE public.pending_payments DROP CONSTRAINT IF EXISTS pending_payments_transaction_reference_key;
DROP INDEX IF EXISTS public.pending_payments_transaction_reference_key;
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_item_name_key;
DROP INDEX IF EXISTS public.inventory_items_item_name_key;
ALTER TABLE public.expense_categories DROP CONSTRAINT IF EXISTS expense_categories_name_key;
DROP INDEX IF EXISTS public.expense_categories_name_key;
ALTER TABLE public.delivery_zones DROP CONSTRAINT IF EXISTS delivery_zones_zone_code_key;
DROP INDEX IF EXISTS public.delivery_zones_zone_code_key;
ALTER TABLE public.fiscal_years DROP CONSTRAINT IF EXISTS unique_fiscal_year;
DROP INDEX IF EXISTS public.unique_fiscal_year;
ALTER TABLE public.payroll_employees DROP CONSTRAINT IF EXISTS payroll_employees_employee_id_number_key;
DROP INDEX IF EXISTS public.payroll_employees_employee_id_number_key;
ALTER TABLE public.branches DROP CONSTRAINT IF EXISTS branches_code_key;
DROP INDEX IF EXISTS public.branches_code_key;
ALTER TABLE public.automated_backup_dates DROP CONSTRAINT IF EXISTS automated_backup_dates_backup_date_key;
DROP INDEX IF EXISTS public.automated_backup_dates_backup_date_key;

COMMIT;

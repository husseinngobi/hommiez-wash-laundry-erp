-- Record the first time an order reaches delivered status for accrual reporting.
-- Existing rows use pickup_date when available; updated_at/created_at are only
-- historical fallbacks because older records did not preserve a delivery time.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

UPDATE public.orders
SET delivered_at = COALESCE(pickup_date, updated_at, created_at)
WHERE status = 'delivered'
  AND delivered_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_order_delivered_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_set_delivered_at ON public.orders;
CREATE TRIGGER orders_set_delivered_at
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_delivered_at();

CREATE INDEX IF NOT EXISTS idx_orders_tenant_delivered_at
  ON public.orders (tenant_id, delivered_at)
  WHERE delivered_at IS NOT NULL;

-- The old daily cache is global by date, append-only, and cannot correctly
-- represent tenant, branch, refunds, or deletions. Reports now query source
-- ledgers directly, so stop adding new stale rows to that legacy cache.
DROP TRIGGER IF EXISTS trigger_update_revenue_summary ON public.orders;
DROP TRIGGER IF EXISTS trigger_update_financial_summary ON public.expenses;
DROP TRIGGER IF EXISTS salary_payment_trigger ON public.salary_payments;

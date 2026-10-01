-- Keep payroll payment basis explicit and consistent.
UPDATE payroll_employees
SET payment_frequency = 'MONTHLY'
WHERE payment_frequency IS NULL
   OR UPPER(payment_frequency) NOT IN ('MONTHLY', 'BI_WEEKLY', 'WEEKLY', 'DAILY');

ALTER TABLE payroll_employees
  DROP CONSTRAINT IF EXISTS payroll_employees_payment_frequency_check;

ALTER TABLE payroll_employees
  ADD CONSTRAINT payroll_employees_payment_frequency_check
  CHECK (payment_frequency IN ('MONTHLY', 'BI_WEEKLY', 'WEEKLY', 'DAILY'));

-- Prevent new ledger entries from exceeding an order's fixed price.
CREATE OR REPLACE FUNCTION prevent_order_overpayment()
RETURNS TRIGGER AS $$
DECLARE
  order_total NUMERIC;
  active_paid NUMERIC;
BEGIN
  SELECT COALESCE(total_amount, total, 0)
    INTO order_total
    FROM orders
   WHERE id = NEW.order_id
   FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0)
    INTO active_paid
    FROM payments
   WHERE order_id = NEW.order_id
     AND (is_cancelled IS NULL OR is_cancelled = FALSE);

  IF active_paid + NEW.amount > order_total + 0.01 THEN
    RAISE EXCEPTION 'Payment exceeds order total';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_prevent_overpayment ON payments;
CREATE TRIGGER payments_prevent_overpayment
  BEFORE INSERT ON payments
  FOR EACH ROW
  WHEN (NEW.is_refund IS NULL OR NEW.is_refund = FALSE)
  EXECUTE FUNCTION prevent_order_overpayment();

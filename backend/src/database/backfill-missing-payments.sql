-- Fix orders marked PAID with UGX 0 and no payments ledger row.
-- Run in Supabase SQL Editor if you need the fix BEFORE the next Render deploy.

-- 1) Correct fake PAID orders (amount_paid = 0)
UPDATE orders
SET
  amount_paid = total_amount,
  balance = 0,
  payment_status = 'PAID',
  payment_method = COALESCE(NULLIF(payment_method, ''), 'CASH'),
  updated_at = NOW()
WHERE payment_status = 'PAID'
  AND COALESCE(amount_paid, 0) = 0
  AND COALESCE(total_amount, 0) > 0
  AND COALESCE(payment_method, 'CASH') <> 'ON_ACCOUNT';

-- 2) Create missing payment transactions for any order that has amount_paid > 0 but no ledger row
INSERT INTO payments (
  order_id,
  customer_id,
  amount,
  payment_method,
  payment_date,
  notes,
  created_by
)
SELECT
  o.id,
  o.customer_id,
  o.amount_paid,
  COALESCE(NULLIF(o.payment_method, ''), 'CASH'),
  o.created_at,
  'Backfilled payment for order ' || o.order_number || ' (cash paid at create)',
  o.user_id
FROM orders o
WHERE COALESCE(o.amount_paid, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id);

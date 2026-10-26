-- Prevent a repeated create-order request from creating a second order.
-- Existing orders remain unchanged because their idempotency_key is NULL.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_user_idempotency_key
  ON public.orders (tenant_id, user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

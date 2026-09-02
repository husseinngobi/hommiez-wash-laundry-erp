ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS catalogue_kg NUMERIC(10, 2);

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_catalogue_kg_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_catalogue_kg_check CHECK (catalogue_kg IS NULL OR catalogue_kg > 0);
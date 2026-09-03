import { query } from '../config/database';

export async function ensureCatalogueKgColumn(): Promise<void> {
  await query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS catalogue_kg NUMERIC(10, 2)
  `);

  await query(`
    ALTER TABLE orders
      DROP CONSTRAINT IF EXISTS orders_catalogue_kg_check
  `);

  await query(`
    ALTER TABLE orders
      ADD CONSTRAINT orders_catalogue_kg_check
      CHECK (catalogue_kg IS NULL OR catalogue_kg > 0)
  `);

  console.log('✅ ensureCatalogueKgColumn: orders.catalogue_kg ready');
}
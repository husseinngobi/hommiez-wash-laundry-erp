import { query } from '../config/database';

/**
 * Adds a surcharge_amount column to order_items and orders.
 * A surcharge ("price up") is the opposite of a bargain — it adds to the
 * customer's price, e.g. for stain treatment, special handling, etc.
 * Only ADMIN / MANAGER roles may apply surcharges.
 */
export async function ensureSurcharges(): Promise<void> {
  await query(`
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS surcharge_amount INTEGER NOT NULL DEFAULT 0
  `);

  await query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS surcharge_amount INTEGER NOT NULL DEFAULT 0
  `);

  console.log('✅ Surcharge columns ready (order_items + orders)');
}

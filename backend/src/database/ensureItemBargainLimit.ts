import { query } from '../config/database';

/**
 * Adds a per-item bargain ceiling to users.
 * max_item_bargain_amount: maximum bargain a staff member may apply to a
 * single order line. The existing max_bargain_amount remains the ceiling for
 * the overall transaction bargain.
 */
export async function ensureItemBargainLimit(): Promise<void> {
  await query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS max_item_bargain_amount INTEGER NOT NULL DEFAULT 0
  `);

  // Default per-item ceiling = 25 % of the overall ceiling so existing users
  // are not suddenly blocked on any currently valid order.
  await query(`
    UPDATE users
    SET max_item_bargain_amount = GREATEST(0, ROUND(COALESCE(max_bargain_amount, 0) * 0.25))
    WHERE max_item_bargain_amount = 0
      AND COALESCE(max_bargain_amount, 0) > 0
  `);

  console.log('✅ Per-item bargain limit column ready');
}

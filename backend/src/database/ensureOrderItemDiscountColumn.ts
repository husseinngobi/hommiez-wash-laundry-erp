import { query } from '../config/database';

/**
 * Per-item bargains. `total_price` stays the NET line total so every existing
 * report, receipt and sum keeps working without change; `discount_amount`
 * only records how much was given away on that line.
 */
export async function ensureOrderItemDiscountColumn(): Promise<void> {
  await query(`
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
  `);

  // Internal description of the garment (colour, brand, marks) so staff can
  // identify it on the rack. Deliberately never printed on customer receipts.
  await query(`
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS notes VARCHAR(200)
  `);

  console.log('✅ Order item discount + notes columns ready');
}

import { query } from '../config/database';

/**
 * Ensure inventory_items can store long-term asset metadata (equipment, machines, devices).
 */
export async function ensureInventoryAssetColumns(): Promise<void> {
  await query(`
    ALTER TABLE inventory_items
      ADD COLUMN IF NOT EXISTS asset_value DECIMAL(14, 2),
      ADD COLUMN IF NOT EXISTS asset_purchase_date DATE,
      ADD COLUMN IF NOT EXISTS asset_serial_number VARCHAR(120),
      ADD COLUMN IF NOT EXISTS asset_condition VARCHAR(40),
      ADD COLUMN IF NOT EXISTS asset_location VARCHAR(200)
  `);

  // Backfill asset_value from unit_cost for existing long-term items
  await query(`
    UPDATE inventory_items
    SET asset_value = COALESCE(asset_value, unit_cost)
    WHERE is_long_term = TRUE
      AND asset_value IS NULL
      AND COALESCE(unit_cost, 0) > 0
  `);

  console.log('✅ Inventory asset columns ready');
}

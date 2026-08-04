import { query } from '../config/database';

/**
 * Adds weight/kg-based pricing support to price_items.
 * pricing_type: 'FIXED' (per-piece, default) | 'PER_KG' (charged by weight).
 * price_per_kg: the rate per kg when pricing_type = 'PER_KG'.
 */
export async function ensureWeightPricing(): Promise<void> {
  try {
    await query(`
      ALTER TABLE price_items
        ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(10) NOT NULL DEFAULT 'FIXED'
          CHECK (pricing_type IN ('FIXED', 'PER_KG')),
        ADD COLUMN IF NOT EXISTS price_per_kg INTEGER NOT NULL DEFAULT 0
    `);
    console.log('✅ ensureWeightPricing: pricing_type and price_per_kg columns ready');
  } catch (err) {
    console.error('⚠️ ensureWeightPricing migration error:', err);
  }
}

import { query } from '../config/database';

/**
 * Delivery payment tracking was only ever defined in a standalone SQL script
 * that was never applied to the hosted database, so the dashboard and the
 * record-payment endpoint both referenced columns that did not exist.
 */
export async function ensureDeliveryPaymentColumns(): Promise<void> {
  await query(`
    ALTER TABLE deliveries
      ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
  `);

  await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`);

  await query(`
    ALTER TABLE deliveries
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING'
  `);

  await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP`);
  await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS payment_notes TEXT`);

  await query(
    `CREATE INDEX IF NOT EXISTS idx_deliveries_payment_status
       ON deliveries (payment_status)`
  );

  console.log('✅ Delivery payment columns ready');
}

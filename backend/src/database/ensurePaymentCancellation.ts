import { query } from '../config/database';

/**
 * Add soft-cancel support to the payments table.
 * When an admin cancels a payment it is marked is_cancelled=TRUE (audit trail preserved).
 * A subsequent "Delete Permanently" action hard-deletes the row.
 */
export async function ensurePaymentCancellation(): Promise<void> {
  try {
    await query(`
      ALTER TABLE payments
        ADD COLUMN IF NOT EXISTS is_cancelled    BOOLEAN     NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS cancelled_at    TIMESTAMP   NULL,
        ADD COLUMN IF NOT EXISTS cancelled_by    INTEGER     NULL REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS cancellation_reason TEXT    NULL
    `);
    console.log('✅ ensurePaymentCancellation: payments cancellation columns ready');
  } catch (error) {
    console.error('❌ ensurePaymentCancellation failed:', error);
  }
}

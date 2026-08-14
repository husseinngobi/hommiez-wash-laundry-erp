import { query } from '../config/database';

/**
 * Keep historical-order flags and their payment ledger dates aligned to the
 * business calendar day — without touching same-day walk-in orders.
 */
export async function ensureBackdatedPaymentDates(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_patches (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Undo the previous timezone comparison that could flag ordinary same-day orders.
  const unflagged = await query(`
    UPDATE orders
    SET is_backdated = FALSE
    WHERE COALESCE(is_backdated, FALSE) = TRUE
      AND date_trunc('day', created_at)
        = date_trunc('day', COALESCE(recorded_at, created_at))
  `);
  if ((unflagged.rowCount || 0) > 0) {
    console.log(`✅ Cleared historical flag on ${unflagged.rowCount} same-day order(s)`);
  }

  const flagged = await query(`
    UPDATE orders
    SET is_backdated = TRUE
    WHERE COALESCE(is_backdated, FALSE) = FALSE
      AND recorded_at IS NOT NULL
      AND date_trunc('day', created_at) < date_trunc('day', recorded_at)
  `);
  if ((flagged.rowCount || 0) > 0) {
    console.log(`✅ Marked ${flagged.rowCount} past-date order(s) as historical`);
  }

  const initialAligned = await query(`
    UPDATE payments p
    SET payment_date = date_trunc('day', o.created_at) + INTERVAL '12 hours'
    FROM orders o
    WHERE p.order_id = o.id
      AND COALESCE(o.is_backdated, FALSE) = TRUE
      AND date_trunc('day', p.payment_date) <> date_trunc('day', o.created_at)
      AND (
        p.notes ILIKE 'Initial payment%'
        OR p.notes ILIKE 'Backfilled payment%'
      )
      AND (p.is_refund IS NULL OR p.is_refund = FALSE)
      AND (p.is_cancelled IS NULL OR p.is_cancelled = FALSE)
  `);
  if ((initialAligned.rowCount || 0) > 0) {
    console.log(`✅ Aligned ${initialAligned.rowCount} initial/backfilled payment date(s)`);
  }

  const patchName = 'repair_manual_backdated_payments_20260814';
  const inserted = await query(
    `INSERT INTO schema_patches (name) VALUES ($1)
     ON CONFLICT (name) DO NOTHING
     RETURNING name`,
    [patchName]
  );
  if ((inserted.rowCount || 0) > 0) {
    const manualAligned = await query(`
      UPDATE payments p
      SET payment_date = date_trunc('day', o.created_at) + INTERVAL '12 hours'
      FROM orders o
      WHERE p.order_id = o.id
        AND COALESCE(o.is_backdated, FALSE) = TRUE
        AND p.notes ILIKE 'Manual payment%'
        AND date_trunc('day', p.payment_date) = date_trunc('day', CURRENT_TIMESTAMP)
        AND date_trunc('day', o.created_at) < date_trunc('day', CURRENT_TIMESTAMP)
        AND (p.is_refund IS NULL OR p.is_refund = FALSE)
        AND (p.is_cancelled IS NULL OR p.is_cancelled = FALSE)
    `);
    if ((manualAligned.rowCount || 0) > 0) {
      console.log(`✅ One-time aligned ${manualAligned.rowCount} manual payment(s) on historical orders`);
    }
  }
}

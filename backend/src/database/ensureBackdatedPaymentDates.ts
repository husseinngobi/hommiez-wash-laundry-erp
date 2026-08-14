import { query } from '../config/database';

/**
 * Past-date (backdated) orders were getting a payments row stamped with "now".
 * Align those initial/backfill ledger rows to the order's business date.
 */
export async function ensureBackdatedPaymentDates(): Promise<void> {
  const flagged = await query(`
    UPDATE orders
    SET is_backdated = TRUE
    WHERE COALESCE(is_backdated, FALSE) = FALSE
      AND recorded_at IS NOT NULL
      AND (created_at AT TIME ZONE 'Africa/Nairobi')::date
        < (recorded_at AT TIME ZONE 'Africa/Nairobi')::date
  `);
  if ((flagged.rowCount || 0) > 0) {
    console.log(`✅ Marked ${flagged.rowCount} past-date order(s) as historical`);
  }

  const result = await query(`
    UPDATE payments p
    SET payment_date = o.created_at
    FROM orders o
    WHERE p.order_id = o.id
      AND COALESCE(o.is_backdated, FALSE) = TRUE
      AND DATE(p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi')
        <> DATE(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi')
      AND (
        p.notes ILIKE 'Initial payment%'
        OR p.notes ILIKE 'Backfilled payment%'
      )
      AND (p.is_refund IS NULL OR p.is_refund = FALSE)
      AND (p.is_cancelled IS NULL OR p.is_cancelled = FALSE)
  `);

  if ((result.rowCount || 0) > 0) {
    console.log(`✅ Aligned ${result.rowCount} backdated payment date(s) to the order date`);
  }
}

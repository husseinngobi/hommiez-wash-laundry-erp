import { query } from '../config/database';

/**
 * Repair orders marked PAID (or with amount_paid > 0) that never got a payments row.
 * Staff often click Cash + Paid without typing amount → amount_paid stayed 0 and no ledger entry.
 */
export async function backfillMissingPaymentTransactions(): Promise<void> {
  // 1) Fake PAID with zero paid → treat as fully paid (cash already received at counter)
  const fakePaid = await query(`
    UPDATE orders
    SET
      amount_paid = total_amount,
      balance = 0,
      payment_status = 'PAID',
      payment_method = COALESCE(NULLIF(payment_method, ''), 'CASH'),
      updated_at = NOW()
    WHERE payment_status = 'PAID'
      AND COALESCE(amount_paid, 0) = 0
      AND COALESCE(total_amount, 0) > 0
      AND COALESCE(payment_method, 'CASH') <> 'ON_ACCOUNT'
    RETURNING id, order_number, customer_id, total_amount, payment_method, user_id
  `);

  for (const order of fakePaid.rows) {
    const existing = await query(
      `SELECT id FROM payments WHERE order_id = $1 LIMIT 1`,
      [order.id]
    );
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO payments (
          order_id, customer_id, amount, payment_method,
          payment_date, notes, created_by
        ) VALUES ($1, $2, $3, $4, COALESCE(
          (SELECT created_at FROM orders WHERE id = $1),
          CURRENT_TIMESTAMP
        ), $5, $6)`,
        [
          order.id,
          order.customer_id,
          order.total_amount,
          order.payment_method || 'CASH',
          `Backfilled payment for order ${order.order_number} (cash/paid at create)`,
          order.user_id,
        ]
      );
    }
  }

  // 2) Any order with money paid but no payments ledger row
  const missingLedger = await query(`
    SELECT o.id, o.order_number, o.customer_id, o.amount_paid, o.payment_method, o.user_id, o.created_at
    FROM orders o
    WHERE COALESCE(o.amount_paid, 0) > 0
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)
  `);

  for (const order of missingLedger.rows) {
    await query(
      `INSERT INTO payments (
        order_id, customer_id, amount, payment_method,
        payment_date, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        order.id,
        order.customer_id,
        order.amount_paid,
        order.payment_method || 'CASH',
        order.created_at || new Date(),
        `Backfilled payment for order ${order.order_number}`,
        order.user_id,
      ]
    );
  }

  const repaired = fakePaid.rowCount || 0;
  const ledgerFixed = missingLedger.rowCount || 0;
  if (repaired > 0 || ledgerFixed > 0) {
    console.log(
      `✅ Payment backfill: ${repaired} fake-PAID order(s) corrected, ${ledgerFixed} missing ledger row(s) created`
    );
  } else {
    console.log('✅ Payment backfill: no missing payment transactions');
  }

  // Keep denormalized balance in sync (UI lists / aging may still read the column)
  await syncOrderBalances();
}

/**
 * Recalculate orders.balance from total_amount − amount_paid when out of sync.
 */
export async function syncOrderBalances(): Promise<void> {
  const result = await query(`
    UPDATE orders
    SET balance = GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0)),
        updated_at = NOW()
    WHERE COALESCE(balance, -1) <> GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))
  `);
  if ((result.rowCount || 0) > 0) {
    console.log(`✅ Synced balance on ${result.rowCount} order(s)`);
  }
}

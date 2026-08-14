import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import PDFDocument from 'pdfkit';
import { createSystemNotification, notifyAdministrators } from './notifications.controller';
import { forbiddenIfOutsideBranch, resolveListBranchId } from '../utils/branchScope';
import { extractYmd, kampalaTodayYmd, ymdToPgTimestamp } from '../utils/businessDate';
import { logDelete } from '../utils/activityLogger';

/**
 * Recalculate order payment totals from remaining payments ledger rows.
 */
async function syncOrderPaymentFromLedger(orderId: number | string) {
  const orderResult = await query(
    `SELECT id, order_number, total_amount, payment_method, status
     FROM orders WHERE id = $1`,
    [orderId]
  );
  if (orderResult.rows.length === 0) {
    return null;
  }
  const order = orderResult.rows[0];
  const totalAmount = Number(order.total_amount) || 0;

  // Only sum active (non-cancelled) payments for the balance calculation
  const sumResult = await query(
    `SELECT COALESCE(SUM(amount), 0) as net_paid
     FROM payments
     WHERE order_id = $1 AND (is_cancelled IS NULL OR is_cancelled = FALSE)`,
    [orderId]
  );
  const netPaid = Math.max(0, Number(sumResult.rows[0].net_paid) || 0);
  const balance = Math.max(0, totalAmount - netPaid);

  let paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  if (netPaid <= 0) {
    paymentStatus = 'UNPAID';
  } else if (totalAmount > 0 && netPaid >= totalAmount) {
    paymentStatus = 'PAID';
  } else {
    paymentStatus = 'PARTIAL';
  }

  // Zero paid → treat as On Account (credit) until money is received again
  const paymentMethod =
    paymentStatus === 'UNPAID'
      ? 'ON_ACCOUNT'
      : order.payment_method === 'ON_ACCOUNT'
        ? 'CASH'
        : order.payment_method;

  const updated = await query(
    `UPDATE orders
     SET amount_paid = $1,
         balance = $2,
         payment_status = $3,
         payment_method = COALESCE($4, payment_method),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [
      paymentStatus === 'UNPAID' ? 0 : Math.min(netPaid, totalAmount || netPaid),
      balance,
      paymentStatus,
      paymentStatus === 'UNPAID' ? 'ON_ACCOUNT' : paymentMethod,
      orderId,
    ]
  );

  return updated.rows[0];
}

/**
 * ADMIN only: cancel (delete) a mistaken payment ledger row and resync the order.
 * Does not create a refund row — use Process Refund when cash was actually returned.
 */
export const cancelPayment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER')) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only administrators and managers can cancel a payment ledger entry',
      });
    }

    const { id } = req.params;
    const { reason } = req.body || {};

    const paymentResult = await query(
      `SELECT p.*, o.order_number, o.total_amount, o.payment_status as order_payment_status,
              c.name as customer_name
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       LEFT JOIN customers c ON p.customer_id = c.id
       WHERE p.id = $1`,
      [id]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    if (payment.is_refund === true) {
      return res.status(400).json({
        error: 'Cannot cancel a refund entry. Refunds stay in the ledger for audit.',
      });
    }

    if (payment.is_cancelled === true) {
      return res.status(400).json({
        error: 'Payment is already cancelled. You may delete it permanently from the details view.',
      });
    }

    // Block cancel if linked refunds still reference this payment
    const childRefunds = await query(
      `SELECT id FROM payments WHERE refunded_payment_id = $1 LIMIT 1`,
      [id]
    );
    if (childRefunds.rows.length > 0) {
      return res.status(400).json({
        error: 'This payment has linked refunds. Process accounting via refund tools instead of cancel.',
      });
    }

    // Soft-cancel: mark as cancelled but keep the record for audit trail
    await query(
      `UPDATE payments
       SET is_cancelled = TRUE,
           cancelled_at = CURRENT_TIMESTAMP,
           cancelled_by = $1,
           cancellation_reason = $2
       WHERE id = $3`,
      [req.user.id, reason || 'Admin cancelled payment entry', id]
    );

    // Recalculate order payment status (sync ignores cancelled payments)
    const updatedOrder = await syncOrderPaymentFromLedger(payment.order_id);
    if (!updatedOrder) {
      return res.status(500).json({ error: 'Payment cancelled but order sync failed' });
    }

    await logDelete(
      req.user.id,
      req.user.email,
      req.user.full_name,
      req.user.role,
      'payment',
      parseInt(id, 10),
      {
        action: 'soft_cancel',
        cancelled_amount: payment.amount,
        payment_method: payment.payment_method,
        order_id: payment.order_id,
        order_number: payment.order_number,
        reason: reason || 'Admin cancelled payment entry',
        resulting_payment_status: updatedOrder.payment_status,
        resulting_amount_paid: updatedOrder.amount_paid,
        resulting_balance: updatedOrder.balance,
      },
      req.ip
    );

    console.log(
      `🚫 ${req.user.role} ${req.user.email} soft-cancelled payment #${id} (UGX ${Number(payment.amount).toLocaleString()}) on ${payment.order_number} → ${updatedOrder.payment_status}`
    );

    if (req.user.role === 'MANAGER') {
      await notifyAdministrators(
        'payment',
        'Payment cancelled by manager',
        `${req.user.full_name} cancelled a ${Number(payment.amount).toLocaleString()} payment on ${payment.order_number}.`,
        '/payments'
      );
    }

    res.json({
      message: 'Payment cancelled successfully. You may now delete it permanently if needed.',
      cancelled_payment: {
        id: payment.id,
        amount: payment.amount,
        payment_method: payment.payment_method,
        order_number: payment.order_number,
        is_cancelled: true,
      },
      order: {
        id: updatedOrder.id,
        order_number: updatedOrder.order_number,
        amount_paid: updatedOrder.amount_paid,
        balance: updatedOrder.balance,
        payment_status: updatedOrder.payment_status,
        payment_method: updatedOrder.payment_method,
      },
    });
  } catch (error) {
    console.error('Cancel payment error:', error);
    res.status(500).json({ error: 'Failed to cancel payment' });
  }
};

/**
 * ADMIN only: permanently delete a payment that has already been soft-cancelled.
 * A payment must be cancelled first before it can be permanently deleted.
 */
export const deletePaymentPermanently = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only administrators can permanently delete payment records',
      });
    }

    const { id } = req.params;

    const paymentResult = await query(
      `SELECT p.*, o.order_number, o.id as order_id
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE p.id = $1`,
      [id]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    if (!payment.is_cancelled) {
      return res.status(400).json({
        error: 'Payment must be cancelled before it can be permanently deleted. Cancel it first.',
      });
    }

    await query(`DELETE FROM payments WHERE id = $1`, [id]);

    console.log(
      `🗑️ Admin ${req.user.email} permanently deleted cancelled payment #${id} (UGX ${Number(payment.amount).toLocaleString()}) on ${payment.order_number}`
    );

    res.json({
      message: 'Payment permanently deleted from records.',
      deleted_payment: {
        id: payment.id,
        amount: payment.amount,
        order_number: payment.order_number,
      },
    });
  } catch (error) {
    console.error('Delete payment permanently error:', error);
    res.status(500).json({ error: 'Failed to permanently delete payment' });
  }
};

/**
 * Get all payments with filtering
 * Now reads from the payments table for complete transaction history
 */
export const getAllPayments = async (req: AuthRequest, res: Response) => {
  try {
    const {
      from_date,
      to_date,
      payment_method,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    let whereConditions = ['1=1'];
    const values: any[] = [];
    let paramCount = 1;

    // Date range filter
    if (from_date && to_date) {
      whereConditions.push(`(p.payment_date AT TIME ZONE 'Africa/Nairobi')::date BETWEEN $${paramCount} AND $${paramCount + 1}`);
      values.push(from_date, to_date);
      paramCount += 2;
    }

    // Payment method filter
    if (payment_method && payment_method !== 'ALL') {
      if (payment_method === 'MOBILE_MONEY') {
        whereConditions.push(`p.payment_method LIKE '%MOBILE_MONEY%'`);
      } else if (payment_method === 'MTN') {
        whereConditions.push(`p.payment_method LIKE '%MTN%'`);
      } else if (payment_method === 'AIRTEL') {
        whereConditions.push(`p.payment_method LIKE '%AIRTEL%'`);
      } else {
        whereConditions.push(`p.payment_method = $${paramCount}`);
        values.push(payment_method);
        paramCount++;
      }
    }

    // Search filter (order number, customer name, transaction reference)
    if (search) {
      whereConditions.push(`(
        o.order_number ILIKE $${paramCount} OR
        c.name ILIKE $${paramCount} OR
        p.transaction_reference ILIKE $${paramCount}
      )`);
      values.push(`%${search}%`);
      paramCount++;
    }

    const listBranchId = resolveListBranchId(req, req.query.branch_id);
    if (listBranchId) {
      whereConditions.push(`o.branch_id = $${paramCount++}`);
      values.push(listBranchId);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as count
       FROM payments p
       LEFT JOIN orders o ON p.order_id = o.id
       LEFT JOIN customers c ON p.customer_id = c.id
       WHERE ${whereClause}`,
      values
    );

    const totalCount = parseInt(countResult.rows[0].count);

    // Get payments from payments table
    const offset = (Number(page) - 1) * Number(limit);
    const result = await query(
      `SELECT 
        p.id,
        o.order_number,
        p.payment_date,
        p.amount as amount_paid,
        p.payment_method,
        o.payment_status,
        p.transaction_reference,
        COALESCE(o.total_amount, o.total, 0) as total_amount,
        GREATEST(0, COALESCE(o.total_amount, o.total, 0) - COALESCE(o.amount_paid, 0)) as balance,
        c.name as customer_name,
        c.phone as customer_phone,
        u.full_name as received_by,
        p.notes,
        p.is_cancelled,
        p.cancelled_at,
        p.cancellation_reason
       FROM payments p
       LEFT JOIN orders o ON p.order_id = o.id
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN users u ON p.created_by = u.id
       WHERE ${whereClause}
       ORDER BY
         CASE WHEN o.payment_status IN ('UNPAID', 'PARTIAL') THEN 0 ELSE 1 END,
         p.payment_date DESC,
         p.id DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...values, limit, offset]
    );

    res.json({
      payments: result.rows,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(limit)),
        totalCount,
        pageSize: Number(limit),
      },
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
};

/**
 * Get payment statistics (Admin only)
 */
export const getPaymentStatistics = async (req: AuthRequest, res: Response) => {
  try {
    const { from_date, to_date } = req.query;

    let dateFilter = '';
    const values: any[] = [];

    if (from_date && to_date) {
      dateFilter = "WHERE (payment_date AT TIME ZONE 'Africa/Nairobi')::date BETWEEN $1 AND $2";
      values.push(from_date, to_date);
    } else {
      // Default to all time so the summary cards reflect the full payment ledger
      dateFilter = '';
    }

    // Total payments by method from payments table
    const paymentsByMethod = await query(
      `SELECT 
        CASE 
          WHEN payment_method LIKE '%MTN%' THEN 'MTN Mobile Money'
          WHEN payment_method LIKE '%AIRTEL%' THEN 'Airtel Money'
          WHEN payment_method = 'CASH' THEN 'Cash'
          WHEN payment_method = 'BANK_TRANSFER' THEN 'Bank Transfer'
          WHEN payment_method = 'ON_ACCOUNT' THEN 'On Account'
          ELSE payment_method
        END as method,
        COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) as total_amount
       FROM payments
       ${dateFilter}
       GROUP BY method
       ORDER BY total_amount DESC`,
      values
    );

    // Daily payment trends (last 30 days) from payments table
    const dailyTrends = await query(
      `SELECT 
        DATE(payment_date) as date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) as total_amount
       FROM payments
       WHERE payment_date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY DATE(payment_date)
       ORDER BY date DESC
       LIMIT 30`
    );

    // Payment status breakdown - still from orders table as it tracks order status
    const paymentStatus = await query(
      `SELECT 
        payment_status,
        COUNT(*) as count,
        COALESCE(SUM(amount_paid), 0) as total_paid,
        COALESCE(SUM(GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))), 0) as total_balance
       FROM orders
       ${dateFilter.replace('payment_date', 'created_at')}
       GROUP BY payment_status`,
      values
    );

    // Total summary - revenue from payments; outstanding from all open orders
    const summary = await query(
      `SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(p.amount), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN o.payment_status = 'PAID' THEN p.amount ELSE 0 END), 0) as fully_paid,
        COALESCE(SUM(CASE WHEN o.payment_status = 'PARTIAL' THEN p.amount ELSE 0 END), 0) as partial_paid
       FROM payments p
       LEFT JOIN orders o ON p.order_id = o.id
       ${dateFilter}`,
      values
    );

    const outstanding = await query(
      `SELECT COALESCE(SUM(
         GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))
       ), 0) as outstanding_balance
       FROM orders
       WHERE payment_status IN ('UNPAID', 'PARTIAL')`
    );

    res.json({
      paymentsByMethod: paymentsByMethod.rows,
      dailyTrends: dailyTrends.rows,
      paymentStatus: paymentStatus.rows,
      summary: {
        ...summary.rows[0],
        outstanding_balance: outstanding.rows[0].outstanding_balance,
      },
    });
  } catch (error) {
    console.error('Get payment statistics error:', error);
    res.status(500).json({ error: 'Failed to fetch payment statistics' });
  }
};

/**
 * Get payment details by ID
 */
export const getPaymentById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
        p.id,
        p.order_id,
        p.customer_id,
        p.amount,
        p.payment_method,
        p.transaction_reference,
        p.payment_date,
        p.notes,
        p.created_by,
        p.created_at,
        p.is_refund,
        p.refund_reason,
        p.refund_date,
        p.refunded_payment_id,
        o.order_number,
        o.payment_status,
        o.total_amount,
        o.amount_paid,
        o.balance,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        u.full_name as received_by,
        u.email as receiver_email,
        o.branch_id as order_branch_id
       FROM payments p
       LEFT JOIN orders o ON p.order_id = o.id
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (forbiddenIfOutsideBranch(req, res, result.rows[0].order_branch_id)) {
      return;
    }

    // Get order items for the payment's order if available
    let items: { rows: any[] } = { rows: [] };
    if (result.rows[0].order_id) {
      items = await query(
        `SELECT 
          oi.*,
          pi.name as item_name
         FROM order_items oi
         LEFT JOIN price_items pi ON oi.price_item_id = pi.id
         WHERE oi.order_id = $1`,
        [result.rows[0].order_id]
      );
    }

    res.json({
      payment: result.rows[0],
      items: items.rows,
    });
  } catch (error) {
    console.error('Get payment by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch payment details' });
  }
};

/**
 * Export payments to CSV (Admin only)
 */
export const exportPayments = async (req: AuthRequest, res: Response) => {
  try {
    const { from_date, to_date, payment_method } = req.query;

    let whereConditions = ['p.amount > 0'];
    const values: any[] = [];
    let paramCount = 1;

    if (from_date && to_date) {
      whereConditions.push(`(p.payment_date AT TIME ZONE 'Africa/Nairobi')::date BETWEEN $${paramCount} AND $${paramCount + 1}`);
      values.push(from_date, to_date);
      paramCount += 2;
    }

    if (payment_method && payment_method !== 'ALL') {
      whereConditions.push(`p.payment_method = $${paramCount}`);
      values.push(payment_method);
      paramCount++;
    }

    const whereClause = whereConditions.join(' AND ');

    const result = await query(
      `SELECT 
        o.order_number,
        p.payment_date,
        c.name as customer_name,
        c.phone as customer_phone,
        p.payment_method,
        p.transaction_reference,
        p.amount as amount_paid,
        o.payment_status,
        GREATEST(0, COALESCE(o.total_amount, o.total, 0) - COALESCE(o.amount_paid, 0)) as balance,
        u.full_name as received_by
       FROM payments p
       LEFT JOIN orders o ON p.order_id = o.id
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE ${whereClause}
       ORDER BY p.payment_date DESC`,
      values
    );

    // Convert to CSV
    const csvHeaders = [
      'Order Number',
      'Payment Date',
      'Customer Name',
      'Customer Phone',
      'Payment Method',
      'Transaction Reference',
      'Amount Paid',
      'Payment Status',
      'Balance',
      'Received By',
    ];

    const csvRows = result.rows.map(row => [
      row.order_number || '',
      row.payment_date ? new Date(row.payment_date).toLocaleString() : '',
      row.customer_name || '',
      row.customer_phone || '',
      row.payment_method || '',
      row.transaction_reference || 'N/A',
      row.amount_paid || 0,
      row.payment_status || '',
      row.balance || 0,
      row.received_by || '',
    ]);

    const csv = [csvHeaders, ...csvRows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payments_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export payments error:', error);
    res.status(500).json({ error: 'Failed to export payments' });
  }
};

/**
 * Export payments to PDF (Admin only)
 */
export const exportPaymentsPDF = async (req: AuthRequest, res: Response) => {
  try {
    const { from_date, to_date, payment_method } = req.query;

    let whereConditions = ['p.amount > 0'];
    const values: any[] = [];
    let paramCount = 1;

    if (from_date && to_date) {
      whereConditions.push(`(p.payment_date AT TIME ZONE 'Africa/Nairobi')::date BETWEEN $${paramCount} AND $${paramCount + 1}`);
      values.push(from_date, to_date);
      paramCount += 2;
    }

    if (payment_method && payment_method !== 'ALL') {
      whereConditions.push(`p.payment_method = $${paramCount}`);
      values.push(payment_method);
      paramCount++;
    }

    const whereClause = whereConditions.join(' AND ');

    const result = await query(
      `SELECT 
        o.order_number,
        p.payment_date,
        c.name as customer_name,
        c.phone as customer_phone,
        p.payment_method,
        p.transaction_reference,
        p.amount as amount_paid,
        o.payment_status,
        GREATEST(0, COALESCE(o.total_amount, o.total, 0) - COALESCE(o.amount_paid, 0)) as balance,
        u.full_name as received_by
       FROM payments p
       LEFT JOIN orders o ON p.order_id = o.id
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN users u ON p.created_by = u.id
       WHERE ${whereClause}
       ORDER BY p.payment_date DESC`,
      values
    );

    // Create PDF document
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=payments_${Date.now()}.pdf`);
    
    // Pipe PDF to response
    doc.pipe(res);

    // Add header
    doc.fontSize(20).font('Helvetica-Bold').text('LUSH LAUNDRY', { align: 'center' });
    doc.fontSize(16).text('Payment Transactions Report', { align: 'center' });
    doc.moveDown();
    
    // Add report details
    doc.fontSize(10).font('Helvetica');
    const periodText = from_date && to_date 
      ? `Period: ${from_date} to ${to_date}` 
      : 'Period: All Time';
    doc.text(periodText);
    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.text(`Total Transactions: ${result.rows.length}`);
    
    // Calculate total amount
    const totalAmount = result.rows.reduce((sum, row) => sum + parseFloat(row.amount_paid || 0), 0);
    doc.text(`Total Amount: UGX ${totalAmount.toLocaleString()}`);
    doc.moveDown();

    // Add table headers
    const tableTop = doc.y;
    const colWidths = {
      order: 60,
      date: 75,
      customer: 80,
      method: 70,
      amount: 70,
      status: 50,
    };

    doc.fontSize(9).font('Helvetica-Bold');
    let x = 50;
    doc.text('Order #', x, tableTop, { width: colWidths.order });
    x += colWidths.order;
    doc.text('Date', x, tableTop, { width: colWidths.date });
    x += colWidths.date;
    doc.text('Customer', x, tableTop, { width: colWidths.customer });
    x += colWidths.customer;
    doc.text('Method', x, tableTop, { width: colWidths.method });
    x += colWidths.method;
    doc.text('Amount', x, tableTop, { width: colWidths.amount, align: 'right' });
    x += colWidths.amount;
    doc.text('Status', x, tableTop, { width: colWidths.status });

    // Draw line under headers
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    // Add table rows
    doc.font('Helvetica').fontSize(8);
    let y = tableTop + 20;

    for (const row of result.rows) {
      // Check if we need a new page
      if (y > 720) {
        doc.addPage();
        y = 50;
        
        // Redraw headers on new page
        doc.fontSize(9).font('Helvetica-Bold');
        let headerX = 50;
        doc.text('Order #', headerX, y, { width: colWidths.order });
        headerX += colWidths.order;
        doc.text('Date', headerX, y, { width: colWidths.date });
        headerX += colWidths.date;
        doc.text('Customer', headerX, y, { width: colWidths.customer });
        headerX += colWidths.customer;
        doc.text('Method', headerX, y, { width: colWidths.method });
        headerX += colWidths.method;
        doc.text('Amount', headerX, y, { width: colWidths.amount, align: 'right' });
        headerX += colWidths.amount;
        doc.text('Status', headerX, y, { width: colWidths.status });
        
        doc.moveTo(50, y + 15).lineTo(550, y + 15).stroke();
        y += 20;
        doc.font('Helvetica').fontSize(8);
      }

      x = 50;
      const rowY = y;
      
      doc.text(row.order_number || 'N/A', x, rowY, { width: colWidths.order });
      x += colWidths.order;
      
      const dateStr = row.payment_date 
        ? new Date(row.payment_date).toLocaleDateString() 
        : 'N/A';
      doc.text(dateStr, x, rowY, { width: colWidths.date });
      x += colWidths.date;
      
      doc.text(row.customer_name || 'N/A', x, rowY, { width: colWidths.customer, ellipsis: true });
      x += colWidths.customer;
      
      const methodText = (row.payment_method || 'N/A').replace(/_/g, ' ');
      doc.text(methodText, x, rowY, { width: colWidths.method, ellipsis: true });
      x += colWidths.method;
      
      const amountText = `${parseFloat(row.amount_paid || 0).toLocaleString()}`;
      doc.text(amountText, x, rowY, { width: colWidths.amount, align: 'right' });
      x += colWidths.amount;
      
      doc.text(row.payment_status || 'N/A', x, rowY, { width: colWidths.status });
      
      y += 18;
    }

    // Add footer summary
    doc.moveDown(2);
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(`Grand Total: UGX ${totalAmount.toLocaleString()}`, { align: 'right' });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Export payments PDF error:', error);
    res.status(500).json({ error: 'Failed to export payments to PDF' });
  }
};

/**
 * Record a payment against an order. The assigned payment_date (YYYY-MM-DD)
 * is stored as that calendar day — not "now".
 */
export const addOrderPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const {
      amount,
      payment_method,
      payment_date,
      transaction_reference,
      notes,
    } = req.body || {};

    const paymentAmount = parseFloat(String(amount));
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than zero' });
    }

    const orderRow = await query(
      `SELECT * FROM orders WHERE id = $1`,
      [orderId]
    );
    if (orderRow.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRow.rows[0];
    if (forbiddenIfOutsideBranch(req, res, order.branch_id)) {
      return;
    }

    const paymentYmd =
      extractYmd(payment_date) ||
      (order.is_backdated ? extractYmd(order.created_at) : null) ||
      kampalaTodayYmd();

    const inserted = await query(
      `INSERT INTO payments (
        order_id,
        customer_id,
        amount,
        payment_method,
        transaction_reference,
        payment_date,
        notes,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6::timestamp, $7, $8)
      RETURNING *`,
      [
        order.id,
        order.customer_id,
        paymentAmount,
        payment_method || order.payment_method || 'CASH',
        transaction_reference || null,
        ymdToPgTimestamp(paymentYmd),
        notes ? `Manual payment: ${notes}` : 'Manual payment added to order',
        req.user?.id || null,
      ]
    );

    if (payment_method) {
      await query(
        `UPDATE orders SET payment_method = $1 WHERE id = $2`,
        [payment_method, order.id]
      );
    }

    const updatedOrder = await syncOrderPaymentFromLedger(order.id);

    res.json({
      message: 'Payment recorded',
      payment: inserted.rows[0],
      order: updatedOrder,
      payment_date: paymentYmd,
    });
  } catch (error) {
    console.error('Add order payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
};

/**
 * Get all payment transactions for a specific order
 */
export const getPaymentsByOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const orderRow = await query('SELECT id, branch_id FROM orders WHERE id = $1', [orderId]);
    if (orderRow.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (forbiddenIfOutsideBranch(req, res, orderRow.rows[0].branch_id)) {
      return;
    }

    const result = await query(
      `SELECT 
        p.id,
        p.order_id,
        p.amount,
        p.payment_method,
        p.transaction_reference,
        p.payment_date,
        p.notes,
        p.created_by,
        p.created_at,
        p.is_refund,
        p.refund_reason,
        p.refund_date,
        p.refunded_payment_id,
        u.full_name as received_by,
        -- Calculate how much of this payment has been refunded (if it's a regular payment)
        CASE WHEN p.is_refund = FALSE THEN
          COALESCE(
            (SELECT SUM(ABS(r.amount)) 
             FROM payments r 
             WHERE r.refunded_payment_id = p.id AND r.is_refund = TRUE), 
            0
          )
        ELSE 0
        END as amount_refunded
       FROM payments p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.order_id = $1
       ORDER BY p.payment_date DESC, p.id DESC`,
      [orderId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get payments by order error:', error);
    res.status(500).json({ error: 'Failed to fetch payment transactions' });
  }
};

/**
 * Process refund for an order
 * Supports three refund types:
 *   - 'transaction': Refund a specific payment transaction (full or partial amount)
 *   - 'order': Order-level blanket refund (current default behavior)
 *   - 'damage': Partial refund for item damage (order stays active, no auto-cancel)
 * Only ADMIN and MANAGER can process refunds
 */
export const processRefund = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const { 
      refund_amount, 
      refund_reason, 
      payment_method,
      transaction_reference,
      notes,
      cancel_order, // Optional: Auto-cancel order on full refund
      payment_id,   // Optional: Target a specific payment transaction
      refund_type   // 'transaction' | 'order' | 'damage' (defaults to 'order')
    } = req.body;

    const effectiveRefundType = refund_type || 'order';

    // Validate user exists
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate user role (only ADMIN and MANAGER can refund)
    if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Only administrators and managers can process refunds' 
      });
    }

    // Validate required fields
    if (!refund_amount || refund_amount <= 0) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Refund amount must be greater than zero' 
      });
    }

    if (!refund_reason || refund_reason.trim() === '') {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Refund reason is required for audit purposes' 
      });
    }

    // Validate refund_type
    if (!['transaction', 'order', 'damage'].includes(effectiveRefundType)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'refund_type must be one of: transaction, order, damage'
      });
    }

    // If refund_type is 'transaction', payment_id is required
    if (effectiveRefundType === 'transaction' && !payment_id) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'payment_id is required for transaction-level refunds'
      });
    }

    // Get order details
    const orderResult = await query(
      `SELECT 
        o.id,
        o.order_number,
        o.customer_id,
        o.total_amount,
        o.amount_paid,
        o.balance,
        o.payment_status,
        o.status as order_status,
        c.name as customer_name,
        c.phone as customer_phone
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // DELIVERED orders: only ADMIN can process refunds
    if (order.order_status === 'delivered' && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Refund not allowed',
        message: 'Only the administrator can process refunds for delivered orders. Please contact your admin.'
      });
    }

    // Per-transaction refund validation
    let targetPayment: any = null;
    if (effectiveRefundType === 'transaction' && payment_id) {
      // Get the specific payment transaction
      const paymentResult = await query(
        `SELECT p.id, p.amount, p.payment_method, p.transaction_reference, p.is_refund, p.order_id
         FROM payments p
         WHERE p.id = $1 AND p.order_id = $2`,
        [payment_id, orderId]
      );

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Payment not found',
          message: `Payment #${payment_id} not found for this order`
        });
      }

      targetPayment = paymentResult.rows[0];

      // Cannot refund a refund
      if (targetPayment.is_refund) {
        return res.status(400).json({
          error: 'Invalid refund target',
          message: 'Cannot refund a refund transaction'
        });
      }

      // Check how much has already been refunded against this specific payment
      const paymentRefundsResult = await query(
        `SELECT COALESCE(SUM(ABS(amount)), 0) as already_refunded
         FROM payments
         WHERE refunded_payment_id = $1 AND is_refund = TRUE`,
        [payment_id]
      );
      const alreadyRefunded = parseFloat(paymentRefundsResult.rows[0].already_refunded);
      const paymentAvailable = targetPayment.amount - alreadyRefunded;

      if (refund_amount > paymentAvailable) {
        return res.status(400).json({
          error: 'Invalid refund amount',
          message: `Only UGX ${paymentAvailable.toLocaleString()} is available on payment #${payment_id} (original: UGX ${targetPayment.amount.toLocaleString()}, already refunded: UGX ${alreadyRefunded.toLocaleString()})`,
          payment_amount: targetPayment.amount,
          already_refunded: alreadyRefunded,
          available_for_refund: paymentAvailable
        });
      }
    }

    // Validate refund amount doesn't exceed amount paid
    if (refund_amount > order.amount_paid) {
      return res.status(400).json({ 
        error: 'Invalid refund amount',
        message: `Cannot refund UGX ${refund_amount.toLocaleString()} when only UGX ${order.amount_paid.toLocaleString()} was paid`,
        amount_paid: order.amount_paid
      });
    }

    // Get total refunds already processed for this order
    const refundsResult = await query(
      `SELECT COALESCE(SUM(ABS(amount)), 0) as total_refunded
       FROM payments
       WHERE order_id = $1 AND is_refund = TRUE`,
      [orderId]
    );

    const totalRefunded = parseFloat(refundsResult.rows[0].total_refunded);
    const availableForRefund = order.amount_paid - totalRefunded;

    if (refund_amount > availableForRefund) {
      return res.status(400).json({ 
        error: 'Invalid refund amount',
        message: `Only UGX ${availableForRefund.toLocaleString()} is available for refund (already refunded: UGX ${totalRefunded.toLocaleString()})`,
        amount_paid: order.amount_paid,
        total_refunded: totalRefunded,
        available_for_refund: availableForRefund
      });
    }

    // Create refund payment record (negative amount)
    // If per-transaction, link via refunded_payment_id
    const refundResult = await query(
      `INSERT INTO payments (
        order_id,
        customer_id,
        amount,
        payment_method,
        transaction_reference,
        payment_date,
        notes,
        created_by,
        is_refund,
        refund_reason,
        refund_date,
        refunded_payment_id
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, TRUE, $8, CURRENT_TIMESTAMP, $9)
      RETURNING *`,
      [
        orderId,
        order.customer_id,
        -Math.abs(refund_amount), // Negative amount for refund
        payment_method || (targetPayment ? targetPayment.payment_method : 'CASH'),
        transaction_reference || null,
        notes || `${effectiveRefundType === 'transaction' ? `Refund for payment #${payment_id}` : effectiveRefundType === 'damage' ? 'Damage refund' : 'Order refund'} processed by ${req.user.email}`,
        req.user.id,
        refund_reason,
        effectiveRefundType === 'transaction' ? payment_id : null
      ]
    );

    // Update order amounts
    const newAmountPaid = order.amount_paid - refund_amount;
    const newBalance = order.total_amount - newAmountPaid;
    
    // Determine new payment status
    let newPaymentStatus;
    if (newAmountPaid === 0) {
      newPaymentStatus = 'UNPAID';
    } else if (newAmountPaid >= order.total_amount) {
      newPaymentStatus = 'PAID';
    } else {
      newPaymentStatus = 'PARTIAL';
    }

    // Determine if order should be cancelled
    // Full refund + cancel_order flag OR full refund of delivered/completed order
    // Damage refunds NEVER auto-cancel (the order stays active)
    const isFullRefund = newAmountPaid === 0;
    const shouldCancelOrder = effectiveRefundType !== 'damage' && (cancel_order === true || (isFullRefund && cancel_order !== false));
    
    let newOrderStatus = order.order_status;
    let orderCancelled = false;

    if (shouldCancelOrder && isFullRefund) {
      // Only auto-cancel if order is not already delivered/picked_up
      if (!['delivered', 'picked_up', 'cancelled'].includes(order.order_status)) {
        newOrderStatus = 'cancelled';
        orderCancelled = true;
        console.log(`⚠️  Full refund detected - Automatically cancelling order ${order.order_number}`);
      }
    }

    await query(
      `UPDATE orders
       SET amount_paid = $1,
           balance = $2,
           payment_status = $3,
           status = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [newAmountPaid, newBalance, newPaymentStatus, newOrderStatus, orderId]
    );

    console.log(`💰 Refund processed for order ${order.order_number}:`);
    console.log(`   - Refund Type: ${effectiveRefundType}`);
    console.log(`   - Refund Amount: UGX ${refund_amount.toLocaleString()}`);
    console.log(`   - Reason: ${refund_reason}`);
    if (targetPayment) {
      console.log(`   - Target Payment: #${payment_id} (UGX ${targetPayment.amount.toLocaleString()} via ${targetPayment.payment_method})`);
    }
    console.log(`   - Customer: ${order.customer_name}`);
    console.log(`   - New Amount Paid: UGX ${newAmountPaid.toLocaleString()}`);
    console.log(`   - New Balance: UGX ${newBalance.toLocaleString()}`);
    console.log(`   - New Payment Status: ${newPaymentStatus}`);
    if (orderCancelled) {
      console.log(`   - Order Status: ${order.order_status} → CANCELLED (auto-cancelled due to full refund)`);
    }
    console.log(`   - Processed by: ${req.user.email}`);

    // Notify admin when MANAGER processes refund (for audit trail)
    if (req.user.role === 'MANAGER') {
      try {
        const adminUsers = await query("SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'");
        for (const admin of adminUsers.rows) {
          await createSystemNotification(
            'REFUND_PROCESSED',
            'Refund Processed by Manager',
            `Manager ${req.user.email} processed a ${effectiveRefundType} refund of UGX ${refund_amount.toLocaleString()} for order ${order.order_number}. Reason: ${refund_reason}`,
            `/orders?orderId=${orderId}`,
            admin.id
          );
        }
        console.log(`📧 Admin notification sent: Manager ${req.user.email} processed refund for order ${order.order_number}`);
      } catch (notifError) {
        console.error('Failed to send admin notification for refund:', notifError);
      }
    }

    res.status(200).json({
      message: orderCancelled 
        ? 'Refund processed successfully. Order has been cancelled due to full refund.' 
        : 'Refund processed successfully',
      refund: {
        id: refundResult.rows[0].id,
        order_number: order.order_number,
        refund_amount: refund_amount,
        refund_type: effectiveRefundType,
        refund_reason,
        payment_method: payment_method || (targetPayment ? targetPayment.payment_method : 'CASH'),
        transaction_reference,
        refunded_payment_id: effectiveRefundType === 'transaction' ? payment_id : null,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        refunded_by: req.user.email,
        refund_date: refundResult.rows[0].refund_date
      },
      order: {
        previous_amount_paid: order.amount_paid,
        new_amount_paid: newAmountPaid,
        previous_balance: order.balance,
        new_balance: newBalance,
        previous_payment_status: order.payment_status,
        new_payment_status: newPaymentStatus,
        previous_order_status: order.order_status,
        new_order_status: newOrderStatus,
        order_cancelled: orderCancelled,
        can_be_deleted: orderCancelled // If cancelled, admin can now delete it
      }
    });
  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({ 
      error: 'Failed to process refund',
      message: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
};

/**
 * Get refund summary/statistics (ADMIN/MANAGER only)
 */
export const getRefundSummary = async (req: AuthRequest, res: Response) => {
  try {
    // Validate user exists
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate user role
    if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Only administrators and managers can view refund statistics' 
      });
    }

    const { from_date, to_date } = req.query;

    let dateFilter = '';
    const values: any[] = [];

    if (from_date && to_date) {
      dateFilter = 'WHERE refund_date::date BETWEEN $1 AND $2';
      values.push(from_date, to_date);
    } else {
      // Default to current month
      dateFilter = `WHERE DATE_TRUNC('month', refund_date) = DATE_TRUNC('month', CURRENT_DATE)`;
    }

    // Get refund summary from the view
    const refunds = await query(
      `SELECT *
       FROM refund_summary
       ${dateFilter.replace('WHERE', 'WHERE')}
       ORDER BY refund_date DESC
       LIMIT 100`,
      values
    );

    // Get totals
    const totals = await query(
      `SELECT 
        COUNT(*) as total_refunds,
        COALESCE(SUM(ABS(amount)), 0) as total_refunded_amount,
        COUNT(DISTINCT order_id) as orders_with_refunds
       FROM payments
       WHERE is_refund = TRUE
       ${dateFilter.replace('WHERE', 'AND')}`,
      values
    );

    // Get refunds by reason
    const byReason = await query(
      `SELECT 
        refund_reason,
        COUNT(*) as count,
        COALESCE(SUM(ABS(amount)), 0) as total_amount
       FROM payments
       WHERE is_refund = TRUE
       ${dateFilter.replace('WHERE', 'AND')}
       GROUP BY refund_reason
       ORDER BY total_amount DESC`,
      values
    );

    res.json({
      refunds: refunds.rows,
      summary: totals.rows[0],
      by_reason: byReason.rows
    });
  } catch (error) {
    console.error('Get refund summary error:', error);
    res.status(500).json({ error: 'Failed to fetch refund summary' });
  }
};

/**
 * Create a refund request (DESKTOP_AGENT)
 * Desktop agents can request refunds but need admin approval
 */
export const createRefundRequest = async (req: AuthRequest, res: Response) => {
  try {
    // Authentication check
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { orderId } = req.params;
    const { refund_amount, refund_reason, payment_method, transaction_reference, notes, cancel_order, payment_id, refund_type } = req.body;

    const effectiveRefundType = refund_type || 'order';

    // Validation
    if (!refund_amount || refund_amount <= 0) {
      return res.status(400).json({ error: 'Valid refund amount is required' });
    }

    if (!refund_reason || refund_reason.trim().length < 10) {
      return res.status(400).json({ error: 'Refund reason must be at least 10 characters' });
    }

    if (!['transaction', 'order', 'damage'].includes(effectiveRefundType)) {
      return res.status(400).json({ error: 'refund_type must be one of: transaction, order, damage' });
    }

    if (effectiveRefundType === 'transaction' && !payment_id) {
      return res.status(400).json({ error: 'payment_id is required for transaction-level refunds' });
    }

    // Get order details
    const orderResult = await query(
      `SELECT o.id, o.order_number, o.customer_id, o.total_amount, o.amount_paid, 
              o.balance, o.payment_status, o.status as order_status,
              c.name as customer_name, c.phone as customer_phone
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // DELIVERED orders: only ADMIN can handle refunds
    if (order.order_status === 'delivered' && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Refund not allowed',
        message: 'Only the administrator can handle refunds for delivered orders. Please contact your admin.'
      });
    }

    // Per-transaction validation (if targeting a specific payment)
    let targetPaymentForRequest: any = null;
    if (effectiveRefundType === 'transaction' && payment_id) {
      const paymentResult = await query(
        'SELECT id, amount, payment_method, is_refund FROM payments WHERE id = $1 AND order_id = $2',
        [payment_id, orderId]
      );
      if (paymentResult.rows.length === 0) {
        return res.status(404).json({ error: `Payment #${payment_id} not found for this order` });
      }
      targetPaymentForRequest = paymentResult.rows[0];
      if (targetPaymentForRequest.is_refund) {
        return res.status(400).json({ error: 'Cannot refund a refund transaction' });
      }
      // Check amount available on this specific payment
      const paymentRefundsResult = await query(
        'SELECT COALESCE(SUM(ABS(amount)), 0) as already_refunded FROM payments WHERE refunded_payment_id = $1 AND is_refund = TRUE',
        [payment_id]
      );
      const alreadyRefunded = parseFloat(paymentRefundsResult.rows[0].already_refunded);
      const paymentAvailable = targetPaymentForRequest.amount - alreadyRefunded;
      if (refund_amount > paymentAvailable) {
        return res.status(400).json({
          error: `Only UGX ${paymentAvailable.toLocaleString()} available on payment #${payment_id}`
        });
      }
    }

    // Calculate total already refunded
    const refundedResult = await query(
      'SELECT COALESCE(SUM(ABS(amount)), 0) as total_refunded FROM payments WHERE order_id = $1 AND is_refund = TRUE',
      [orderId]
    );
    const totalRefunded = parseFloat(refundedResult.rows[0].total_refunded);

    // Calculate available for refund
    const availableForRefund = order.amount_paid - totalRefunded;

    if (refund_amount > availableForRefund) {
      return res.status(400).json({ 
        error: `Refund amount exceeds available amount. Available for refund: UGX ${availableForRefund.toLocaleString()}` 
      });
    }

    // Check if there's already a pending request for this order
    const pendingCheck = await query(
      'SELECT id FROM refund_requests WHERE order_id = $1 AND status = $2',
      [orderId, 'PENDING']
    );

    if (pendingCheck.rows.length > 0) {
      return res.status(400).json({ 
        error: 'There is already a pending refund request for this order' 
      });
    }

    // Create refund request
    const requestResult = await query(
      `INSERT INTO refund_requests (
        order_id, requested_amount, refund_reason, payment_method, 
        transaction_reference, notes, requested_by, cancel_order,
        target_payment_id, refund_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, requested_at, status`,
      [
        orderId,
        refund_amount,
        refund_reason,
        payment_method || (targetPaymentForRequest ? targetPaymentForRequest.payment_method : 'CASH'),
        transaction_reference,
        notes,
        req.user.id,
        effectiveRefundType === 'damage' ? false : (cancel_order !== false), // Damage refunds never cancel
        effectiveRefundType === 'transaction' ? payment_id : null,
        effectiveRefundType
      ]
    );

    const request = requestResult.rows[0];

    console.log(`📝 Refund request created for order ${order.order_number}:`);
    console.log(`   - Request ID: ${request.id}`);
    console.log(`   - Refund Type: ${effectiveRefundType}`);
    console.log(`   - Amount: UGX ${refund_amount.toLocaleString()}`);
    console.log(`   - Reason: ${refund_reason}`);
    if (targetPaymentForRequest) {
      console.log(`   - Target Payment: #${payment_id} (UGX ${targetPaymentForRequest.amount.toLocaleString()})`);
    }
    console.log(`   - Requested by: ${req.user.email} (${req.user.role})`);
    console.log(`   - Status: PENDING (awaiting admin approval)`);

    // Notify all admins about the new refund request
    try {
      const adminUsers = await query("SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'");
      for (const admin of adminUsers.rows) {
        await createSystemNotification(
          'REFUND_REQUEST',
          'New Refund Request Pending',
          `${req.user.email} (${req.user.role}) requested a ${effectiveRefundType} refund of UGX ${refund_amount.toLocaleString()} for order ${order.order_number}. Reason: ${refund_reason}`,
          `/refund-requests?requestId=${request.id}`,
          admin.id
        );
      }
      console.log(`📧 Admin notification sent: New refund request #${request.id} from ${req.user.email}`);
    } catch (notifError) {
      console.error('Failed to send admin notification for refund request:', notifError);
    }

    res.status(201).json({
      message: 'Refund request submitted successfully. Waiting for admin approval.',
      request: {
        id: request.id,
        order_id: orderId,
        order_number: order.order_number,
        refund_amount,
        refund_type: effectiveRefundType,
        refund_reason,
        payment_method: payment_method || (targetPaymentForRequest ? targetPaymentForRequest.payment_method : 'CASH'),
        target_payment_id: effectiveRefundType === 'transaction' ? payment_id : null,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        requested_by: req.user.email,
        requested_at: request.requested_at,
        status: request.status
      }
    });
  } catch (error) {
    console.error('Create refund request error:', error);
    res.status(500).json({ error: 'Failed to create refund request' });
  }
};

/**
 * Get all pending refund requests (ADMIN only)
 */
export const getPendingRefundRequests = async (req: AuthRequest, res: Response) => {
  try {
    // Authentication check
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Role check - only ADMIN can view pending requests
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can view pending refund requests' });
    }

    const { status = 'PENDING' } = req.query;

    let requests;
    if (status === 'PENDING') {
      // Use the optimized view for pending requests
      requests = await query(
        `SELECT * FROM pending_refund_requests ORDER BY requested_at ASC`
      );
    } else {
      // For other statuses, query directly
      requests = await query(
        `SELECT rr.*, o.order_number, u.full_name as requested_by_name, u.email as requested_by_email, u.role as requested_by_role,
                c.name as customer_name, c.phone as customer_phone
         FROM refund_requests rr
         JOIN orders o ON rr.order_id = o.id
         JOIN users u ON rr.requested_by = u.id
         JOIN customers c ON o.customer_id = c.id
         WHERE rr.status = $1
         ORDER BY rr.requested_at DESC`,
        [status]
      );
    }

    res.json({
      requests: requests.rows,
      count: requests.rowCount
    });
  } catch (error) {
    console.error('Get pending refund requests error:', error);
    res.status(500).json({ error: 'Failed to fetch pending refund requests' });
  }
};

/**
 * Approve refund request and process refund (ADMIN only)
 */
export const approveRefundRequest = async (req: AuthRequest, res: Response) => {
  try {
    // Authentication check
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Role check - only ADMIN can approve
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can approve refund requests' });
    }

    const { requestId } = req.params;

    // Get request details from the view
    const requestResult = await query(
      'SELECT * FROM pending_refund_requests WHERE id = $1',
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Refund request not found or already processed' });
    }

    const request = requestResult.rows[0];

    // Validate amount is still available
    if (!request.is_valid_amount) {
      return res.status(400).json({ 
        error: `Invalid refund amount. Available: UGX ${request.available_for_refund.toLocaleString()}, Requested: UGX ${request.requested_amount.toLocaleString()}` 
      });
    }

    // Create the refund payment record (negative amount)
    // If per-transaction refund request, link to the original payment
    const targetPaymentId = request.target_payment_id || null;
    const refundResult = await query(
      `INSERT INTO payments (
        order_id, customer_id, amount, payment_method, transaction_reference,
        payment_date, notes, created_by, is_refund, refund_reason, refund_date,
        refunded_payment_id
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, TRUE, $8, CURRENT_TIMESTAMP, $9)
      RETURNING id, payment_date as refund_date`,
      [
        request.order_id,
        (await query('SELECT customer_id FROM orders WHERE id = $1', [request.order_id])).rows[0].customer_id,
        -Math.abs(request.requested_amount), // Negative amount
        request.payment_method,
        request.transaction_reference,
        `Approved refund request #${requestId}. ${request.notes || ''}`.trim(),
        req.user.id,
        request.refund_reason,
        targetPaymentId
      ]
    );

    const refundPayment = refundResult.rows[0];

    // Calculate new order amounts
    const newAmountPaid = request.order_amount_paid - request.requested_amount;
    const newBalance = request.order_total - newAmountPaid;

    // Determine payment status
    let newPaymentStatus;
    if (newAmountPaid === 0) { newPaymentStatus = 'UNPAID'; }
    else if (newAmountPaid >= request.order_total) { newPaymentStatus = 'PAID'; }
    else { newPaymentStatus = 'PARTIAL'; }

    // Auto-cancel logic - damage refunds NEVER auto-cancel
    const effectiveRefundTypeForApproval = request.refund_type || 'order';
    const isFullRefund = newAmountPaid === 0;
    const shouldCancelOrder = effectiveRefundTypeForApproval !== 'damage' && (request.cancel_order === true || (isFullRefund && request.cancel_order !== false));
    let newOrderStatus = request.order_status;
    let orderCancelled = false;

    if (shouldCancelOrder && isFullRefund) {
      if (!['delivered', 'picked_up', 'cancelled'].includes(request.order_status)) {
        newOrderStatus = 'cancelled';
        orderCancelled = true;
        console.log(`⚠️  Full refund approved - Auto-cancelling order ${request.order_number}`);
      }
    }

    // Update order
    await query(
      `UPDATE orders 
       SET amount_paid = $1, balance = $2, payment_status = $3, status = $4, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $5`,
      [newAmountPaid, newBalance, newPaymentStatus, newOrderStatus, request.order_id]
    );

    // Update request status
    await query(
      `UPDATE refund_requests 
       SET status = 'APPROVED', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, 
           refund_payment_id = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [req.user.id, refundPayment.id, requestId]
    );

    console.log(`✅ Refund request #${requestId} approved by ${req.user.email}`);
    console.log(`   - Order: ${request.order_number}`);
    console.log(`   - Amount: UGX ${request.requested_amount.toLocaleString()}`);
    console.log(`   - Requested by: ${request.requested_by_email} (${request.requested_by_role})`);
    console.log(`   - Refund Payment ID: ${refundPayment.id}`);
    if (orderCancelled) {
      console.log(`   - Order cancelled automatically`);
    }

    // Notify the requesting user that their refund was approved
    try {
      await createSystemNotification(
        'REFUND_APPROVED',
        'Refund Request Approved',
        `Your refund request of UGX ${request.requested_amount.toLocaleString()} for order ${request.order_number} has been approved by ${req.user.email}.${orderCancelled ? ' The order has been cancelled.' : ''}`,
        `/orders?orderId=${request.order_id}`,
        request.requested_by
      );
      console.log(`📧 Notification sent to ${request.requested_by_email}: refund request #${requestId} approved`);
    } catch (notifError) {
      console.error('Failed to send approval notification:', notifError);
    }

    res.json({
      message: orderCancelled 
        ? 'Refund request approved and processed. Order has been cancelled due to full refund.'
        : 'Refund request approved and processed successfully',
      refund: {
        id: refundPayment.id,
        request_id: requestId,
        order_number: request.order_number,
        refund_amount: request.requested_amount,
        refund_reason: request.refund_reason,
        customer_name: request.customer_name,
        approved_by: req.user.email,
        refund_date: refundPayment.refund_date
      },
      order: {
        previous_amount_paid: request.order_amount_paid,
        new_amount_paid: newAmountPaid,
        previous_balance: request.order_balance,
        new_balance: newBalance,
        previous_payment_status: request.order_payment_status,
        new_payment_status: newPaymentStatus,
        previous_order_status: request.order_status,
        new_order_status: newOrderStatus,
        order_cancelled: orderCancelled
      }
    });
  } catch (error) {
    console.error('Approve refund request error:', error);
    res.status(500).json({ error: 'Failed to approve refund request' });
  }
};

/**
 * Reject refund request (ADMIN only)
 */
export const rejectRefundRequest = async (req: AuthRequest, res: Response) => {
  try {
    // Authentication check
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Role check - only ADMIN can reject
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can reject refund requests' });
    }

    const { requestId } = req.params;
    const { rejection_reason } = req.body;

    if (!rejection_reason || rejection_reason.trim().length < 10) {
      return res.status(400).json({ error: 'Rejection reason must be at least 10 characters' });
    }

    // Get request details
    const requestResult = await query(
      `SELECT rr.*, o.order_number, u.email as requested_by_email
       FROM refund_requests rr
       JOIN orders o ON rr.order_id = o.id
       JOIN users u ON rr.requested_by = u.id
       WHERE rr.id = $1 AND rr.status = 'PENDING'`,
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Refund request not found or already processed' });
    }

    const request = requestResult.rows[0];

    // Update request status
    await query(
      `UPDATE refund_requests 
       SET status = 'REJECTED', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, 
           rejection_reason = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [req.user.id, rejection_reason, requestId]
    );

    console.log(`❌ Refund request #${requestId} rejected by ${req.user.email}`);
    console.log(`   - Order: ${request.order_number}`);
    console.log(`   - Amount: UGX ${request.requested_amount.toLocaleString()}`);
    console.log(`   - Requested by: ${request.requested_by_email}`);
    console.log(`   - Rejection reason: ${rejection_reason}`);

    // Notify the requesting user that their refund was rejected
    try {
      await createSystemNotification(
        'REFUND_REJECTED',
        'Refund Request Rejected',
        `Your refund request of UGX ${request.requested_amount.toLocaleString()} for order ${request.order_number} was rejected. Reason: ${rejection_reason}. You may submit a new request if needed.`,
        `/refund-requests?requestId=${requestId}`,
        request.requested_by
      );
      console.log(`📧 Notification sent to ${request.requested_by_email}: refund request #${requestId} rejected`);
    } catch (notifError) {
      console.error('Failed to send rejection notification:', notifError);
    }

    res.json({
      message: 'Refund request rejected',
      request: {
        id: requestId,
        order_number: request.order_number,
        refund_amount: request.requested_amount,
        rejection_reason,
        rejected_by: req.user.email
      }
    });
  } catch (error) {
    console.error('Reject refund request error:', error);
    res.status(500).json({ error: 'Failed to reject refund request' });
  }
};

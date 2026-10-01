import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import { createNotification } from './notification.controller';

// Get all pending (unassigned) mobile money payments
export const getPendingPayments = async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        pp.*,
        u.full_name as assigned_by_name
      FROM pending_payments pp
      LEFT JOIN users u ON pp.assigned_by = u.id
      WHERE pp.status = 'PENDING'
      ORDER BY pp.payment_date DESC
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching pending payments:', error);
    res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
};

// Get all rejected payments (Admin only)
export const getRejectedPayments = async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        pp.*,
        u.full_name as rejected_by_name
      FROM pending_payments pp
      LEFT JOIN users u ON pp.assigned_by = u.id
      WHERE pp.status = 'REJECTED'
      ORDER BY pp.updated_at DESC
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching rejected payments:', error);
    res.status(500).json({ error: 'Failed to fetch rejected payments' });
  }
};

// Get payment assignment history (recently assigned payments)
export const getAssignedPayments = async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        pp.*,
        o.order_number,
        c.name as customer_name,
        c.phone as customer_phone,
        u.full_name as assigned_by_name
      FROM pending_payments pp
      LEFT JOIN orders o ON pp.assigned_to_order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON pp.assigned_by = u.id
      WHERE pp.status = 'ASSIGNED'
      ORDER BY pp.assigned_at DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching assigned payments:', error);
    res.status(500).json({ error: 'Failed to fetch assigned payments' });
  }
};

// Get customers with unpaid/partial orders (for customer-based assignment view)
export const getCustomersWithUnpaidOrders = async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        COUNT(o.id) as unpaid_order_count,
        SUM(o.balance) as total_balance_due,
        MIN(o.created_at) as oldest_order_date,
        MAX(o.created_at) as newest_order_date
      FROM customers c
      INNER JOIN orders o ON c.id = o.customer_id
      WHERE o.payment_status IN ('UNPAID', 'PARTIAL')
      GROUP BY c.id, c.name, c.phone, c.email
      HAVING SUM(o.balance) > 0
      ORDER BY SUM(o.balance) DESC
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching customers with unpaid orders:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

// Get unpaid orders for a specific customer
export const getCustomerUnpaidOrders = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;

    const result = await query(`
      SELECT 
        o.id,
        o.order_number,
        o.total_amount,
        o.amount_paid,
        o.balance as balance_due,
        o.created_at,
        o.order_status,
        o.payment_status,
        o.payment_method,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE c.id = $1 
        AND o.payment_status IN ('UNPAID', 'PARTIAL')
      ORDER BY o.created_at DESC
    `, [customerId]);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching customer orders:', error);
    res.status(500).json({ error: 'Failed to fetch customer orders' });
  }
};

// Search for orders to assign payment to
export const searchOrdersForPayment = async (req: Request, res: Response) => {
  try {
    const { searchTerm } = req.query;

    // If no search term, return recent unpaid/partial orders
    if (!searchTerm || searchTerm === '') {
      const result = await query(`
        SELECT 
          o.id,
          o.order_number,
          o.total_amount,
          o.amount_paid,
          o.balance as balance_due,
          o.created_at,
          o.order_status,
          o.payment_status,
          o.payment_method,
          c.id as customer_id,
          c.name as customer_name,
          c.phone as customer_phone,
          c.email as customer_email
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        WHERE o.payment_status IN ('UNPAID', 'PARTIAL')
        ORDER BY o.created_at DESC
      `);
      return res.json(result.rows);
    }

    // Search by order number, customer name, or customer phone
    const result = await query(`
      SELECT 
        o.id,
        o.order_number,
        o.total_amount,
        o.amount_paid,
        o.balance as balance_due,
        o.created_at,
        o.order_status,
        o.payment_status,
        o.payment_method,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE 
        (o.order_number ILIKE $1 OR
        c.name ILIKE $1 OR
        c.phone ILIKE $1 OR
        c.email ILIKE $1)
        AND o.payment_status IN ('UNPAID', 'PARTIAL')
      ORDER BY o.created_at DESC
    `, [`%${searchTerm}%`]);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error searching orders:', error);
    res.status(500).json({ error: 'Failed to search orders' });
  }
};

// Assign a pending payment to an order
export const assignPaymentToOrder = async (req: Request, res: Response) => {
  const client = await getClient();
  
  try {
    const { pendingPaymentId } = req.params;
    const { orderId, paymentType, notes } = req.body;
    const userId = (req as any).user.id;

    if (!orderId || !paymentType) {
      return res.status(400).json({ error: 'Order ID and payment type are required' });
    }

    // Start transaction on dedicated client
    await client.query('BEGIN');
    // Set statement timeout to 5 seconds to prevent hanging transactions
    await client.query('SET LOCAL statement_timeout = 5000');
    
    console.log(`🔄 Starting payment assignment: Payment #${pendingPaymentId} → Order #${orderId}`);

    try {
      // Get pending payment details with row lock (NOWAIT to fail fast if locked)
      const pendingPayment = await client.query(
        'SELECT * FROM pending_payments WHERE id = $1 AND status = $2 FOR UPDATE NOWAIT',
        [pendingPaymentId, 'PENDING']
      );

      if (pendingPayment.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: 'Pending payment not found or already assigned' });
      }

      const payment = pendingPayment.rows[0];

      // Get order details with row lock (NOWAIT to fail fast if already locked)
      const orderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE NOWAIT',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: 'Order not found' });
      }

      const order = orderResult.rows[0];
      const currentAmountPaid = parseFloat(order.amount_paid || 0);
      const paymentAmount = parseFloat(payment.amount);
      const totalAmount = parseFloat(order.total_amount);
      const remaining = Math.max(0, totalAmount - currentAmountPaid);

      if (paymentAmount > remaining + 0.009) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({
          error:
            remaining <= 0
              ? `Order ${order.order_number} is already fully paid (UGX ${totalAmount.toLocaleString()}). This payment cannot be assigned to it.`
              : `Payment of UGX ${paymentAmount.toLocaleString()} exceeds the remaining balance of UGX ${remaining.toLocaleString()} on order ${order.order_number}.`,
          remaining,
          order_total: totalAmount,
        });
      }

      // Calculate new amount paid based on payment type
      const newAmountPaid = currentAmountPaid + paymentAmount;
      
      // Calculate new balance
      const newBalance = Math.max(0, totalAmount - newAmountPaid);

      // Update payment status based on payment
      let newPaymentStatus = 'UNPAID';
      if (newAmountPaid >= totalAmount) {
        newPaymentStatus = 'PAID';
      } else if (newAmountPaid > 0) {
        newPaymentStatus = 'PARTIAL';
      }

      // Update order with new payment
      console.log(`📝 Updating order #${orderId}: paid=${newAmountPaid}, balance=${newBalance}, status=${newPaymentStatus}`);
      await client.query(`
        UPDATE orders 
        SET 
          amount_paid = $1,
          balance = $2,
          payment_method = $3,
          transaction_reference = $4,
          payment_status = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
      `, [newAmountPaid, newBalance, payment.payment_method, payment.transaction_reference, newPaymentStatus, orderId]);

      // Create payment transaction record so it shows in Payments page
      console.log(`💳 Creating payment record: amount=${paymentAmount}, method=${payment.payment_method}`);
      await client.query(`
        INSERT INTO payments (
          order_id,
          customer_id,
          amount,
          payment_method,
          transaction_reference,
          payment_date,
          notes,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        orderId,
        order.customer_id,
        paymentAmount,
        payment.payment_method,
        payment.transaction_reference,
        payment.payment_date,
        notes || `Payment assigned from pending payment #${pendingPaymentId}`,
        userId
      ]);

      // Mark pending payment as assigned
      console.log(`✔️ Marking pending payment #${pendingPaymentId} as ASSIGNED`);
      await client.query(`
        UPDATE pending_payments
        SET 
          status = 'ASSIGNED',
          assigned_to_order_id = $1,
          assigned_by = $2,
          assigned_at = CURRENT_TIMESTAMP,
          notes = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [orderId, userId, notes, pendingPaymentId]);

      // Get admin user IDs (users table has 'status' column, not 'is_active')
      const adminResult = await client.query("SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'");
      const adminIds = adminResult.rows.map(row => row.id);

      // Create notification for admins about payment assignment (don't let this fail the transaction)
      if (adminIds.length > 0) {
        try {
          await createNotification(
            adminIds,
            'PAYMENT_ASSIGNED',
            'Payment Assigned to Order',
            `Payment of UGX ${paymentAmount.toLocaleString()} from ${payment.sender_phone} has been assigned to order ${order.order_number} by staff`,
            {
              pending_payment_id: pendingPaymentId,
              order_id: orderId,
              order_number: order.order_number,
              amount: paymentAmount,
              assigned_by: userId,
              transaction_reference: payment.transaction_reference,
            }
          );
        } catch (notifError) {
          console.error('⚠️ Failed to create notification (non-critical):', notifError);
          // Don't fail the whole transaction just because notifications failed
        }
      }

      await client.query('COMMIT');
      client.release();
      
      console.log(`✅ Payment #${pendingPaymentId} successfully assigned to order #${orderId}`);

      res.json({
        message: 'Payment successfully assigned to order',
        orderId,
        amountPaid: newAmountPaid,
        balance: newBalance,
        paymentStatus: newPaymentStatus
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      client.release();
      console.error('❌ Payment assignment failed:', error);
      
      // Handle specific lock errors
      if (error.code === '55P03') {
        // lock_not_available - NOWAIT failed
        return res.status(409).json({ 
          error: 'This payment or order is currently being processed by another user. Please try again.'
        });
      }
      
      if (error.code === '57014') {
        // query_canceled - statement timeout
        return res.status(408).json({ 
          error: 'Payment assignment timed out. The order may be locked. Please try again.'
        });
      }
      
      throw error;
    }
  } catch (error: any) {
    console.error('Error assigning payment:', error);
    if (client) {
      client.release();
    }
    res.status(500).json({ error: 'Failed to assign payment to order' });
  }
};

// Reject a pending payment (mark as invalid/duplicate)
export const rejectPendingPayment = async (req: Request, res: Response) => {
  try {
    const { pendingPaymentId } = req.params;
    const { reason } = req.body;
    const userId = (req as any).user.id;

    await query(`
      UPDATE pending_payments
      SET 
        status = 'REJECTED',
        assigned_by = $1,
        notes = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND status = 'PENDING'
    `, [userId, reason || 'Rejected by staff', pendingPaymentId]);

    res.json({ message: 'Payment rejected successfully' });
  } catch (error: any) {
    console.error('Error rejecting payment:', error);
    res.status(500).json({ error: 'Failed to reject payment' });
  }
};

// Reassign rejected payment back to PENDING (Admin only)
export const reassignRejectedPayment = async (req: Request, res: Response) => {
  try {
    const { pendingPaymentId } = req.params;
    const userId = (req as any).user.id;

    await query(`
      UPDATE pending_payments
      SET 
        status = 'PENDING',
        assigned_by = NULL,
        assigned_to_order_id = NULL,
        assigned_at = NULL,
        notes = 'Reassigned to pending by admin',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'REJECTED'
    `, [pendingPaymentId]);

    res.json({ message: 'Payment reassigned to pending successfully' });
  } catch (error: any) {
    console.error('Error reassigning payment:', error);
    res.status(500).json({ error: 'Failed to reassign payment' });
  }
};

// Permanently delete rejected payment (Admin only)
export const deleteRejectedPayment = async (req: Request, res: Response) => {
  try {
    const { pendingPaymentId } = req.params;

    // Only allow deletion if status is REJECTED
    const result = await query(`
      DELETE FROM pending_payments
      WHERE id = $1 AND status = 'REJECTED'
      RETURNING id
    `, [pendingPaymentId]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Payment not found or not rejected' });
    }

    res.json({ message: 'Payment deleted permanently' });
  } catch (error: any) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
};

// Webhook endpoint for receiving mobile money payments from API
// This will be called by MTN/Airtel when a payment is made
export const receiveMobileMoneyPayment = async (req: Request, res: Response) => {
  try {
    const {
      transactionReference,
      paymentMethod, // 'MOBILE_MONEY_MTN' or 'MOBILE_MONEY_AIRTEL'
      amount,
      senderPhone,
      senderName,
      paymentDate
    } = req.body;

    // Validate required fields
    if (!transactionReference || !paymentMethod || !amount || !senderPhone) {
      return res.status(400).json({ error: 'Missing required payment information' });
    }

    // Check if transaction already exists
    const existing = await query(
      'SELECT id FROM pending_payments WHERE transaction_reference = $1',
      [transactionReference]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Transaction already recorded' });
    }

    // Insert pending payment
    const result = await query(`
      INSERT INTO pending_payments (
        transaction_reference,
        payment_method,
        amount,
        sender_phone,
        sender_name,
        payment_date,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
      RETURNING *
    `, [
      transactionReference,
      paymentMethod,
      amount,
      senderPhone,
      senderName || null,
      paymentDate || new Date()
    ]);

    // Notify all active users about new payment using the notification system
    await createNotification(
      'all',
      'PENDING_PAYMENT',
      'New Mobile Money Payment Received',
      `${paymentMethod === 'MTN Mobile Money' ? 'MTN' : 'Airtel'} payment of UGX ${amount.toLocaleString()} from ${senderPhone}${senderName ? ` (${senderName})` : ''} needs to be assigned to an order`,
      {
        pending_payment_id: result.rows[0].id,
        transaction_reference: transactionReference,
        amount,
        sender_phone: senderPhone,
        sender_name: senderName,
        payment_method: paymentMethod,
      }
    );

    res.status(201).json({
      message: 'Payment received and pending assignment',
      payment: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error receiving mobile money payment:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
};

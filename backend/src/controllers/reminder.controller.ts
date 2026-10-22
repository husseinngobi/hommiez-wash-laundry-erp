import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { sendSMS } from '../services/sms.service';
import { sendWhatsAppMessage } from '../services/whatsapp.service';

/**
 * Format number as UGX currency
 */
function formatUGX(amount: number): string {
  return `UGX ${amount.toLocaleString('en-UG')}`;
}

/**
 * Send a manual reminder to a customer about their order
 * Context-aware: sends different messages based on order status
 */
export const sendOrderReminder = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params; // Order ID
    const { channel } = req.body; // 'sms' or 'whatsapp' or 'both'

    // Fetch order details with customer info
    const orderResult = await query(
      `SELECT 
        o.id, o.order_number, o.status as order_status, o.payment_status,
        o.total_amount, o.amount_paid, o.balance, o.due_date,
        c.name as customer_name, c.phone as customer_phone, c.sms_opt_in
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Check if customer has opted out of SMS
    if (!order.sms_opt_in && channel === 'sms') {
      return res.status(400).json({ 
        error: 'Customer has opted out of SMS notifications',
        suggestion: 'Try WhatsApp instead'
      });
    }

    // Generate context-aware message
    const message = generateReminderMessage(order);

    // Send via requested channel(s)
    const results = {
      sms: false,
      whatsapp: false
    };

    if (channel === 'sms' || channel === 'both') {
      results.sms = await sendSMS({
        to: order.customer_phone,
        message
      });
    }

    if (channel === 'whatsapp' || channel === 'both') {
      const whatsappResult = await sendWhatsAppMessage({
        to: order.customer_phone,
        message,
        orderId: order.id,
        orderNumber: order.order_number
      });
      results.whatsapp = whatsappResult.success;
    }

    // Log the reminder in whatsapp_messages table for tracking
    await query(
      `INSERT INTO whatsapp_messages (
        customer_id, phone_number, message_text, message_type, status
      )
      SELECT 
        o.customer_id, $1, $2, 'reminder', $3
      FROM orders o
      WHERE o.id = $4`,
      [
        order.customer_phone,
        message,
        (results.sms || results.whatsapp) ? 'sent' : 'failed',
        id
      ]
    );

    // Update order's last_reminder_sent timestamp (if column exists)
    await query(
      `UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Reminder sent successfully',
      results,
      reminderMessage: message
    });
  } catch (error) {
    console.error('Send reminder error:', error);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
};

/**
 * Generate context-aware reminder message based on order status
 */
function generateReminderMessage(order: any): string {
  const businessName = process.env.BUSINESS_NAME || 'Hommiez Wash Laundry and Dry Cleaners';
  const businessPhone = process.env.BUSINESS_PHONE || '+256700000000';
  const normalizedOrderStatus = String(order.order_status || '').toLowerCase();

  // READY for collection
  if (normalizedOrderStatus === 'ready') {
    if (order.payment_status === 'PAID') {
      return `Hello ${order.customer_name}! 🎉

Your laundry order ${order.order_number} is READY for collection!

✅ Status: Ready & Fully Paid
📍 Visit us at: ${businessName}

Please collect your items at your earliest convenience.

Thank you! ✨`;
    } else if (order.payment_status === 'PARTIAL') {
      return `Hello ${order.customer_name}! 👋

Your order ${order.order_number} is READY for collection.

💵 Balance Due: ${formatUGX(order.balance)}
📊 Total: ${formatUGX(order.total_amount)}
✅ Paid: ${formatUGX(order.amount_paid)}

Please complete payment and collect your items.

📞 ${businessPhone}`;
    } else {
      return `Hello ${order.customer_name}! 👋

Your order ${order.order_number} is READY for collection.

💵 Amount Due: ${formatUGX(order.total_amount)}
⚠️ Payment Status: Unpaid

Please make payment and collect your items.

📞 ${businessPhone}`;
    }
  }

  // DELIVERED but payment pending
  if (normalizedOrderStatus === 'delivered' && order.payment_status !== 'PAID') {
    const daysOverdue = order.due_date 
      ? Math.floor((new Date().getTime() - new Date(order.due_date).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    if (order.payment_status === 'PARTIAL') {
      return `Hello ${order.customer_name},

Friendly reminder about your order ${order.order_number}:

💵 Balance Due: ${formatUGX(order.balance)}
📊 Total: ${formatUGX(order.total_amount)}
✅ Paid: ${formatUGX(order.amount_paid)}
${daysOverdue > 0 ? `⏰ Overdue by ${daysOverdue} day${daysOverdue > 1 ? 's' : ''}` : ''}

Please clear the balance at your earliest convenience.

${businessName}
📞 ${businessPhone}`;
    } else {
      return `Hello ${order.customer_name},

Payment reminder for order ${order.order_number}:

💵 Total Amount: ${formatUGX(order.total_amount)}
⚠️ Status: Unpaid
${daysOverdue > 0 ? `⏰ Overdue by ${daysOverdue} day${daysOverdue > 1 ? 's' : ''}` : ''}

Please make payment at your earliest convenience.

${businessName}
📞 ${businessPhone}`;
    }
  }

  // PROCESSING - general update
  if (normalizedOrderStatus === 'processing') {
    return `Hello ${order.customer_name}! 👕

Your order ${order.order_number} is currently being processed.

📦 Status: In Progress
${order.due_date ? `📅 Expected Ready: ${new Date(order.due_date).toLocaleDateString('en-GB')}` : ''}

We'll notify you once it's ready for collection!

${businessName}`;
  }

  // Default generic reminder
  return `Hello ${order.customer_name}! 👋

This is a reminder about your order ${order.order_number}.

📊 Total: ${formatUGX(order.total_amount)}
💰 Balance: ${formatUGX(order.balance)}
📍 Status: ${order.order_status}

For any questions, please contact us:
📞 ${businessPhone}

${businessName}`;
}

/**
 * Get reminder automation settings
 */
export const getReminderSettings = async (req: AuthRequest, res: Response) => {
  try {
    const settingsResult = await query(
      `SELECT setting_value 
       FROM business_settings 
       WHERE setting_key = 'reminder_automation' AND tenant_id = app_current_tenant_id()`
    );

    // Default settings if not configured
    const defaultSettings = {
      enabled: false,
      channels: ['sms'],
      reminders: {
        ready_for_collection: {
          enabled: true,
          after_days: 1,
          repeat_every_days: 3,
          max_reminders: 3
        },
        payment_overdue: {
          enabled: true,
          after_days: 1,
          repeat_every_days: 7,
          max_reminders: 4
        },
        partial_payment: {
          enabled: true,
          after_days: 2,
          repeat_every_days: 5,
          max_reminders: 3
        }
      }
    };

    const settings = settingsResult.rows.length > 0
      ? settingsResult.rows[0].setting_value
      : defaultSettings;

    res.json({ settings });
  } catch (error) {
    console.error('Get reminder settings error:', error);
    res.status(500).json({ error: 'Failed to fetch reminder settings' });
  }
};

/**
 * Update reminder automation settings
 */
export const updateReminderSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { settings } = req.body;

    // Validate settings structure
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings format' });
    }

    // Upsert settings
    await query(
      `INSERT INTO business_settings (setting_key, setting_value, updated_at)
       VALUES ('reminder_automation', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (tenant_id, setting_key)
       DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(settings)]
    );

    res.json({
      success: true,
      message: 'Reminder settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Update reminder settings error:', error);
    res.status(500).json({ error: 'Failed to update reminder settings' });
  }
};

/**
 * Get orders that need automated reminders
 * This will be called by a cron job
 */
export const getOrdersNeedingReminders = async (req: AuthRequest, res: Response) => {
  try {
    // Get reminder settings
    const settingsResult = await query(
      `SELECT setting_value FROM business_settings WHERE setting_key = 'reminder_automation' AND tenant_id = app_current_tenant_id()`
    );

    if (settingsResult.rows.length === 0 || !settingsResult.rows[0].setting_value.enabled) {
      return res.json({ orders: [], message: 'Reminder automation is disabled' });
    }

    const settings = settingsResult.rows[0].setting_value;
    const ordersNeedingReminders = [];

    // Find READY orders needing collection reminders
    if (settings.reminders.ready_for_collection.enabled) {
      const readyOrders = await query(
        `SELECT 
          o.id, o.order_number, o.status as order_status, o.payment_status,
          o.total_amount, o.balance, o.updated_at,
          c.name as customer_name, c.phone as customer_phone
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        WHERE o.status = 'ready'
          AND c.sms_opt_in = true
          AND o.updated_at < NOW() - INTERVAL '${settings.reminders.ready_for_collection.after_days} days'
        ORDER BY o.updated_at ASC
        LIMIT 50`
      );

      ordersNeedingReminders.push(...readyOrders.rows.map(o => ({
        ...o,
        reminder_type: 'ready_for_collection'
      })));
    }

    // Find DELIVERED orders with unpaid/partial payment
    if (settings.reminders.payment_overdue.enabled) {
      const overdueOrders = await query(
        `SELECT 
          o.id, o.order_number, o.status as order_status, o.payment_status,
          o.total_amount, o.balance, o.due_date,
          c.name as customer_name, c.phone as customer_phone
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        WHERE o.status = 'delivered'
          AND o.payment_status IN ('UNPAID', 'PARTIAL')
          AND o.due_date < CURRENT_DATE
          AND c.sms_opt_in = true
        ORDER BY o.due_date ASC
        LIMIT 50`
      );

      ordersNeedingReminders.push(...overdueOrders.rows.map(o => ({
        ...o,
        reminder_type: 'payment_overdue'
      })));
    }

    res.json({
      orders: ordersNeedingReminders,
      count: ordersNeedingReminders.length,
      settings
    });
  } catch (error) {
    console.error('Get orders needing reminders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

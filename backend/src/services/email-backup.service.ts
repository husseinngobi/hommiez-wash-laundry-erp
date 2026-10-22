import { Resend } from 'resend';
import { query } from '../config/database';
import { notifyDailyBackupSent, notifyDailyBackupFailed } from './notification.service';
import PDFDocument from 'pdfkit';

const resend = new Resend(process.env.RESEND_API_KEY);

interface DailyBackupData {
  date: string;
  orders: any[];
  customers: any[];
  deliveries: any[];
  summary: {
    totalOrders: number;
    totalRevenue: number;
    newCustomers: number;
    deliveriesScheduled: number;
  };
}

/**
 * Email service for sending automated daily backups (via Resend API)
 */
export class EmailBackupService {
  constructor() {}

  async getTodayTransactions(): Promise<DailyBackupData> {
    const today = new Date().toISOString().split('T')[0];
    return this.getTransactionsForDate(today);
  }

  async getTransactionsForDate(dateStr: string): Promise<DailyBackupData> {
    const ordersResult = await query(
      `SELECT o.*, o.status as order_status, c.name as customer_name, c.phone as customer_phone,
        COALESCE(
          (SELECT json_agg(json_build_object(
              'item_name', pi.name,
              'service_type', oi.service_type,
              'quantity', oi.quantity,
              'unit_price', oi.unit_price,
              'total_price', oi.total_price
            ) ORDER BY oi.id)
           FROM order_items oi
           JOIN price_items pi ON oi.price_item_id = pi.id
           WHERE oi.order_id = o.id
          ), '[]'::json
        ) as items
       FROM orders o JOIN customers c ON o.customer_id = c.id
       WHERE DATE(o.created_at) = $1 ORDER BY o.created_at DESC`,
      [dateStr]
    );
    const customersResult = await query(
      `SELECT * FROM customers WHERE DATE(created_at) = $1 ORDER BY created_at DESC`,
      [dateStr]
    );
    const deliveriesResult = await query(
      `SELECT d.*, o.order_number, c.name as customer_name
       FROM deliveries d JOIN orders o ON d.order_id = o.id JOIN customers c ON o.customer_id = c.id
       WHERE d.scheduled_date = $1 ORDER BY d.scheduled_time_slot`,
      [dateStr]
    );
    // Actual revenue received today = real payments, not order totals
    const paymentsResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_received
       FROM payments
       WHERE DATE(payment_date) = $1 AND is_refund = FALSE`,
      [dateStr]
    );
    const totalRevenue = parseFloat(paymentsResult.rows[0].total_received) || 0;
    const totalOrders = ordersResult.rows.length;
    
    return {
      date: dateStr,
      orders: ordersResult.rows,
      customers: customersResult.rows,
      deliveries: deliveriesResult.rows,
      summary: {
        totalOrders,
        totalRevenue,
        newCustomers: customersResult.rows.length,
        deliveriesScheduled: deliveriesResult.rows.length,
      },
    };
  }

  formatEmailHTML(data: DailyBackupData): string {
    const { date, orders, customers, deliveries, summary } = data;

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background: #6366f1; color: white; padding: 20px; text-align: center; }
    .summary { background: #f3f4f6; padding: 20px; margin: 20px 0; border-radius: 8px; }
    .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
    .summary-item { background: white; padding: 15px; border-radius: 6px; }
    .summary-value { font-size: 24px; font-weight: bold; color: #6366f1; }
    .section { margin: 30px 0; }
    .section-title { font-size: 20px; font-weight: bold; color: #6366f1; margin-bottom: 15px; border-bottom: 2px solid #6366f1; padding-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #6366f1; color: white; padding: 12px; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    tr:hover { background: #f9fafb; }
    .footer { text-align: center; color: #6b7280; margin-top: 40px; padding: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🧺 Lush Laundry - Daily Backup Report</h1>
    <p>Date: ${new Date(date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  </div>
  <div style="padding: 20px;">
    <div class="summary">
      <h2 style="margin-top: 0;">📊 Daily Summary</h2>
      <div class="summary-grid">
        <div class="summary-item"><div>Total Orders</div><div class="summary-value">${summary.totalOrders}</div></div>
        <div class="summary-item"><div>Revenue Received</div><div class="summary-value">${summary.totalRevenue.toLocaleString()} UGX</div></div>
        <div class="summary-item"><div>New Customers</div><div class="summary-value">${summary.newCustomers}</div></div>
        <div class="summary-item"><div>Deliveries Scheduled</div><div class="summary-value">${summary.deliveriesScheduled}</div></div>
      </div>
    </div>
    <div class="section">
      <h3 class="section-title">📦 Today's Orders (${orders.length})</h3>
      ${orders.length > 0 ? `
        ${orders.map(order => `
          <div style="border:1px solid #e5e7eb; border-radius:8px; margin-bottom:16px; overflow:hidden;">
            <div style="background:#f3f4f6; padding:10px 14px; display:flex; justify-content:space-between; flex-wrap:wrap;">
              <strong>${order.order_number}</strong>
              <span>${order.customer_name} · ${order.customer_phone}</span>
              <span>Status: <strong>${order.order_status || 'N/A'}</strong></span>
              <span>Payment: <strong>${order.payment_status || 'N/A'}</strong> (Paid: ${parseFloat(order.amount_paid || 0).toLocaleString()} UGX${Number(order.balance) > 0 ? `, Balance: ${parseFloat(order.balance).toLocaleString()} UGX` : ''})</span>
              <span>${new Date(order.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <table style="margin:0;">
              <thead><tr><th>Item</th><th>Service</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>
              <tbody>
                ${(order.items || []).map((item: any) => `
                  <tr>
                    <td>${item.item_name}</td>
                    <td>${item.service_type}</td>
                    <td>${item.quantity}</td>
                    <td>${parseFloat(item.unit_price).toLocaleString()} UGX</td>
                    <td>${parseFloat(item.total_price).toLocaleString()} UGX</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div style="text-align:right; padding:8px 14px; font-weight:bold; background:#fafafa;">
              Order Total: ${parseFloat(order.total_amount).toLocaleString()} UGX
            </div>
          </div>
        `).join('')}
      ` : '<p>No orders created today.</p>'}
    </div>
    <div class="section">
      <h3 class="section-title">👥 New Customers (${customers.length})</h3>
      ${customers.length > 0 ? `
        <table>
          <thead><tr><th>Customer ID</th><th>Name</th><th>Phone</th><th>Type</th><th>Registered</th></tr></thead>
          <tbody>
            ${customers.map(customer => `
              <tr>
                <td><strong>${customer.customer_id}</strong></td>
                <td>${customer.name}</td>
                <td>${customer.phone}</td>
                <td>${customer.customer_type}</td>
                <td>${new Date(customer.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p>No new customers registered today.</p>'}
    </div>
    <div class="section">
      <h3 class="section-title">🚚 Today's Deliveries (${deliveries.length})</h3>
      ${deliveries.length > 0 ? `
        <table>
          <thead><tr><th>Order #</th><th>Customer</th><th>Type</th><th>Time Slot</th><th>Status</th></tr></thead>
          <tbody>
            ${deliveries.map(delivery => `
              <tr>
                <td><strong>${delivery.order_number}</strong></td>
                <td>${delivery.customer_name}</td>
                <td>${delivery.delivery_type}</td>
                <td>${delivery.scheduled_time_slot || 'Not set'}</td>
                <td>${delivery.delivery_status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p>No deliveries scheduled for today.</p>'}
    </div>
  </div>
  <div class="footer">
    <p><strong>Lush Laundry Management System</strong></p>
    <p>This is an automated daily backup email. Please keep this for your records.</p>
    <p style="font-size: 12px; color: #9ca3af;">Generated on ${new Date().toLocaleString('en-GB')}</p>
  </div>
</body>
</html>
    `;
  }

  async generatePDFBuffer(dataList: DailyBackupData[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).fillColor('#6366f1').text('Lush Laundry — Backup Report', { align: 'center' });
      const rangeLabel = dataList.length === 1
        ? new Date(dataList[0].date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : `${dataList.length} days combined (catch-up after an earlier failure)`;
      doc.fontSize(11).fillColor('#666').text(rangeLabel, { align: 'center' });
      doc.moveDown(1.5);

      dataList.forEach((data, idx) => {
        const { date, orders, customers, deliveries, summary } = data;
        if (idx > 0) doc.addPage();

        doc.fontSize(16).fillColor('#111').text(
          new Date(date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        );
        doc.moveDown(0.5);

        doc.fontSize(13).fillColor('#111').text('Summary', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(11).fillColor('#333');
        doc.text(`Total Orders: ${summary.totalOrders}`);
        doc.text(`Revenue Received: UGX ${summary.totalRevenue.toLocaleString()}`);
        doc.text(`New Customers: ${summary.newCustomers}`);
        doc.text(`Deliveries Scheduled: ${summary.deliveriesScheduled}`);
        doc.moveDown(1);

        doc.fontSize(13).fillColor('#111').text(`Orders (${orders.length})`, { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#333');
        if (orders.length === 0) {
          doc.text('No orders created.');
        } else {
          orders.forEach((order: any) => {
            doc.fontSize(9).fillColor('#111').text(
              `${order.order_number}  |  ${order.customer_name}  |  ${order.customer_phone}  |  Status: ${order.order_status || 'N/A'}  |  Payment: ${order.payment_status || 'N/A'}  |  Total: UGX ${parseFloat(order.total_amount).toLocaleString()}`
            );
            (order.items || []).forEach((item: any) => {
              doc.fontSize(8).fillColor('#555').text(
                `      • ${item.item_name} (${item.service_type}) x${item.quantity} — UGX ${parseFloat(item.total_price).toLocaleString()}`
              );
            });
            doc.moveDown(0.3);
          });
        }
        doc.moveDown(1);

        doc.fontSize(13).fillColor('#111').text(`New Customers (${customers.length})`, { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#333');
        if (customers.length === 0) {
          doc.text('No new customers.');
        } else {
          customers.forEach((c: any) => {
            doc.text(`${c.name}  |  ${c.phone}  |  ${c.customer_type || ''}`);
          });
        }
        doc.moveDown(1);

        doc.fontSize(13).fillColor('#111').text(`Deliveries (${deliveries.length})`, { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#333');
        if (deliveries.length === 0) {
          doc.text('No deliveries scheduled.');
        } else {
          deliveries.forEach((d: any) => {
            doc.text(`${d.order_number}  |  ${d.customer_name}  |  ${d.delivery_type}  |  ${d.scheduled_time_slot || 'Not set'}  |  ${d.delivery_status}`);
          });
        }
      });

      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999').text(`Generated on ${new Date().toLocaleString('en-GB')}`, { align: 'center' });
      doc.end();
    });
  }

  async getAdminEmails(): Promise<string[]> {
    const result = await query(
      `SELECT email FROM users 
       WHERE role = 'ADMIN' AND email IS NOT NULL AND email != ''
       ORDER BY email`
    );
    return result.rows.map(row => row.email);
  }

  async getRecipientEmails(): Promise<string[]> {
    const settingResult = await query(
      `SELECT setting_value FROM business_settings WHERE setting_key = 'business_email' AND tenant_id = app_current_tenant_id()`
    );
    const businessEmail = settingResult.rows[0]?.setting_value;

    if (businessEmail && typeof businessEmail === 'string' && businessEmail.trim()) {
      const cleaned = businessEmail.replace(/^"|"$/g, '').trim();
      if (cleaned) return [cleaned];
    }

    return this.getAdminEmails();
  }

  async sendDailyBackup(dates?: string[]): Promise<{ success: boolean; message: string; sentTo?: string[] }> {
    try {
      const targetDates = dates && dates.length > 0 ? dates : [new Date().toISOString().split('T')[0]];
      console.log(`📧 Starting backup email generation for: ${targetDates.join(', ')}`);

      const recipientEmails = await this.getRecipientEmails();
      if (recipientEmails.length === 0) {
        console.log('⚠️ No recipient email configured');
        return { success: false, message: 'No recipient email configured' };
      }
      console.log(`📬 Sending to: ${recipientEmails.join(', ')}`);

      const dataList: DailyBackupData[] = [];
      for (const d of targetDates) {
        dataList.push(await this.getTransactionsForDate(d));
      }

      const latest = dataList[dataList.length - 1];
      console.log(`📊 Collected data across ${dataList.length} day(s)`);

      // If literally nothing happened on any of the covered days, skip sending —
      // but still report success so these dates aren't retried as "failed" forever.
      const combinedActivity = dataList.reduce(
        (sum, d) => sum + d.summary.totalOrders + d.summary.newCustomers + d.summary.deliveriesScheduled,
        0
      );
      if (combinedActivity === 0) {
        console.log('ℹ️ No orders, customers, or deliveries in this period — skipping email');
        return {
          success: true,
          message: `No activity for ${targetDates.join(', ')} — backup skipped`,
          sentTo: [],
        };
      }

      const htmlContent = this.formatEmailHTML(latest);
      const pdfBuffer = await this.generatePDFBuffer(dataList);
      const pdfFilename = targetDates.length === 1
        ? `Lush-Laundry-Backup-${targetDates[0]}.pdf`
        : `Lush-Laundry-Backup-${targetDates[0]}-to-${targetDates[targetDates.length - 1]}.pdf`;

      const subjectDates = targetDates.length === 1
        ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : `${targetDates.length} days (catch-up)`;

      const emailPayload = {
        from: 'Lush Laundry System <backups@lushlaundromat.com>',
        to: recipientEmails,
        subject: `🧺 Daily Backup - ${subjectDates}`,
        html: htmlContent,
        attachments: [
          {
            filename: pdfFilename,
            content: pdfBuffer.toString('base64'),
          },
        ],
      };

      // Retry up to 3 times with a 3-second pause between attempts to absorb
      // momentary network blips (especially around the midnight cron window).
      let sendError: { message?: string } | null = null;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const result = await resend.emails.send(emailPayload);
        sendError = result.error ?? null;
        if (!sendError) break;
        console.warn(`⚠️ Resend attempt ${attempt}/${maxAttempts} failed: ${sendError.message}`);
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }

      if (sendError) {
        throw new Error(sendError.message || 'Resend failed to send the email after multiple attempts');
      }

      console.log(`✅ Backup email sent successfully to: ${recipientEmails.join(', ')}`);

      await notifyDailyBackupSent(recipientEmails.length, latest.summary.totalOrders, latest.summary.newCustomers);

      return {
        success: true,
        message: `Backup email sent to ${recipientEmails.length} recipient(s) covering ${targetDates.length} day(s)`,
        sentTo: recipientEmails,
      };
    } catch (error) {
      console.error('❌ Failed to send backup email:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send backup email';
      await notifyDailyBackupFailed(errorMessage);
      return { success: false, message: errorMessage };
    }
  }
}

export const emailBackupService = new EmailBackupService();

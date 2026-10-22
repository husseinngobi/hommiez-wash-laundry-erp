import { Response } from 'express';
import { validationResult } from 'express-validator';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { sendSmartMessage } from '../services/sms.service';

/**
 * Send announcement/promotion to all customers or filtered group
 */
export const sendAnnouncement = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      title, 
      message, 
      customerType, // 'all', 'active', 'inactive'
      includeDiscount,
      discountPercentage 
    } = req.body;

    const userId = req.user?.id;

    // Build customer filter query
    let customerQuery = `
      SELECT id, name, phone 
      FROM customers 
      WHERE phone IS NOT NULL AND phone != ''
    `;

    if (customerType === 'active') {
      // Customers with orders in last 30 days
      customerQuery += ` 
        AND id IN (
          SELECT DISTINCT customer_id 
          FROM orders 
          WHERE created_at > NOW() - INTERVAL '30 days'
        )
      `;
    } else if (customerType === 'inactive') {
      // Customers with no orders in last 30 days
      customerQuery += ` 
        AND id NOT IN (
          SELECT DISTINCT customer_id 
          FROM orders 
          WHERE created_at > NOW() - INTERVAL '30 days'
        )
      `;
    }

    const customersResult = await query(customerQuery);
    const customers = customersResult.rows;

    if (customers.length === 0) {
      return res.status(400).json({ error: 'No customers found with valid phone numbers' });
    }

    // Build announcement message
    let announcementMessage = `📢 ${title}\n\n${message}`;
    
    if (includeDiscount && discountPercentage) {
      announcementMessage += `\n\n🎁 SPECIAL OFFER: ${discountPercentage}% OFF!\n\nShow this message when you visit.`;
    }

    announcementMessage += `\n\n💙 Hommiez Wash Laundry and Dry Cleaners`;

    // Send to all customers
    let sent = 0;
    let failed = 0;
    const deliveryReport: Array<{ 
      customer: string; 
      phone: string; 
      status: 'sent' | 'failed';
      method?: 'whatsapp' | 'sms';
    }> = [];

    for (const customer of customers) {
      const result = await sendSmartMessage(
        customer.phone, 
        announcementMessage.replace('{name}', customer.name)
      );

      if (result.sent) {
        sent++;
        deliveryReport.push({
          customer: customer.name,
          phone: customer.phone,
          status: 'sent',
          method: result.method as 'whatsapp' | 'sms',
        });
      } else {
        failed++;
        deliveryReport.push({
          customer: customer.name,
          phone: customer.phone,
          status: 'failed',
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Log announcement in database
    await query(
      `INSERT INTO announcements 
       (title, message, customer_type, discount_percentage, sent_by, customers_reached, customers_failed, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [title, message, customerType, discountPercentage || 0, userId, sent, failed]
    );

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [
        userId,
        'SEND_ANNOUNCEMENT',
        JSON.stringify({ 
          title, 
          customerType, 
          totalCustomers: customers.length,
          sent,
          failed,
          discountPercentage 
        }),
      ]
    );

    res.json({
      message: 'Announcement sent successfully',
      summary: {
        totalCustomers: customers.length,
        sent,
        failed,
        successRate: ((sent / customers.length) * 100).toFixed(1) + '%',
      },
      deliveryReport: deliveryReport.slice(0, 10), // Return first 10 for preview
    });

  } catch (error) {
    console.error('Send announcement error:', error);
    res.status(500).json({ error: 'Failed to send announcement' });
  }
};

/**
 * Get announcement history
 */
export const getAnnouncementHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT 
        a.id,
        a.title,
        a.message,
        a.customer_type,
        a.discount_percentage,
        a.customers_reached,
        a.customers_failed,
        a.created_at,
        u.full_name as sent_by_name
       FROM announcements a
       LEFT JOIN users u ON a.sent_by = u.id
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await query('SELECT COUNT(*) FROM announcements');
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      announcements: result.rows,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(limit)),
        totalCount,
        pageSize: Number(limit),
      },
    });

  } catch (error) {
    console.error('Get announcement history error:', error);
    res.status(500).json({ error: 'Failed to get announcement history' });
  }
};

/**
 * Schedule festival/holiday announcements
 */
export const scheduleFestivalAnnouncement = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      festivalName, // e.g., "Christmas", "Eid", "New Year"
      scheduledDate,
      message,
      discountPercentage 
    } = req.body;

    const userId = req.user?.id;

    // Save scheduled announcement
    const result = await query(
      `INSERT INTO scheduled_announcements 
       (festival_name, scheduled_date, message, discount_percentage, created_by, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       RETURNING id`,
      [festivalName, scheduledDate, message, discountPercentage, userId]
    );

    res.status(201).json({
      message: 'Festival announcement scheduled successfully',
      scheduledId: result.rows[0].id,
      scheduledFor: scheduledDate,
    });

  } catch (error) {
    console.error('Schedule festival announcement error:', error);
    res.status(500).json({ error: 'Failed to schedule announcement' });
  }
};

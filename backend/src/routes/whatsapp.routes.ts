import express, { Request, Response } from 'express';
import { query } from '../config/database';
import { config } from '../config';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendWhatsAppMessage } from '../services/whatsapp.service';

const router = express.Router();

// GET - Fetch all messages with stats
router.get('/messages', authenticate as any, (async (req: AuthRequest, res: Response) => {
  try {
    const period = req.query.period as string || 'all';
    
    // Build WHERE clause based on period
    let whereClause = '';
    const params: any[] = [];
    
    if (period === 'today') {
      whereClause = 'WHERE DATE(wm.sent_at) = CURRENT_DATE';
    } else if (period === 'week') {
      whereClause = 'WHERE wm.sent_at >= NOW() - INTERVAL \'7 days\'';
    } else if (period === 'month') {
      whereClause = 'WHERE wm.sent_at >= NOW() - INTERVAL \'30 days\'';
    }
    // 'all' means no WHERE clause - return everything

    const messagesResult = await query(
      `SELECT wm.*, c.name as customer_name 
       FROM whatsapp_messages wm
       LEFT JOIN customers c ON wm.customer_id = c.id
       ${whereClause}
       ORDER BY wm.sent_at DESC
       LIMIT 100`,
      params
    );

    const statsResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status IN ('delivered', 'read') THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status IN ('sent', 'pending') THEN 1 END) as pending
      FROM whatsapp_messages
      ${whereClause}
    `, params);

    res.json({
      messages: messagesResult.rows,
      stats: statsResult.rows[0],
    });
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}) as any);

// POST - Send bulk messages
router.post('/send-bulk', authenticate as any, (async (req: AuthRequest, res: Response) => {
  try {
    const { customer_ids, message, campaign_name } = req.body;

    if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
      return res.status(400).json({ error: 'Customer IDs required' });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message required' });
    }

    // Get customer details
    const customersResult = await query(
      `SELECT id, name, phone FROM customers WHERE id = ANY($1)`,
      [customer_ids]
    );

    const customers = customersResult.rows;
    const recipientCount = customers.length;
    let sent = 0;
    let failed = 0;

    // If sending to 2+ customers, create ONE bulk message entry
    // Otherwise, create individual entries
    const isBulk = recipientCount >= 2;

    if (isBulk) {
      // Create a single bulk message summary entry
      await query(
        `INSERT INTO whatsapp_messages 
         (customer_id, phone_number, message_text, message_type, status, 
          is_bulk, campaign_name, recipient_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          null, // No specific customer for bulk
          customers.map(c => c.phone).join(', ').substring(0, 20) + '...', // Truncated list
          message,
          'promotional',
          'pending', // Will update after sending
          true,
          campaign_name || 'Bulk Campaign',
          recipientCount,
        ]
      );
    }

    // Send to each customer
    for (const customer of customers) {
      if (!customer.phone) {
        failed++;
        continue;
      }

      const result = await sendWhatsAppMessage({
        to: customer.phone,
        message: message,
      });

      // For non-bulk (1 recipient), save individual message
      if (!isBulk) {
        await query(
          `INSERT INTO whatsapp_messages 
           (customer_id, phone_number, message_text, message_type, status, whatsapp_message_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            customer.id,
            customer.phone,
            message,
            'promotional',
            result.success ? 'sent' : 'failed',
            result.messageId || null,
          ]
        );
      }

      if (result.success) {
        sent++;
      } else {
        failed++;
      }

      // Small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Update bulk message status after sending
    if (isBulk) {
      const bulkStatus = sent === recipientCount ? 'sent' : (sent > 0 ? 'sent' : 'failed');
      await query(
        `UPDATE whatsapp_messages 
         SET status = $1, sent_at = NOW()
         WHERE is_bulk = true 
           AND campaign_name = $2 
           AND sent_at >= NOW() - INTERVAL '1 minute'
         ORDER BY id DESC
         LIMIT 1`,
        [bulkStatus, campaign_name || 'Bulk Campaign']
      );
    }

    res.json({
      success: true,
      sent,
      failed,
      total: customers.length,
      is_bulk: isBulk,
    });
  } catch (error) {
    console.error('Bulk send error:', error);
    res.status(500).json({ error: 'Failed to send messages' });
  }
}) as any);

// POST endpoint - Receives webhooks from WhatsApp/Twilio
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    console.log('📱 WhatsApp webhook received:', JSON.stringify(req.body, null, 2));
    
    const { From, To, Body, MessageSid, MessageStatus, SmsStatus } = req.body;
    
    // Log the details
    console.log('From:', From);
    console.log('To:', To);
    console.log('Message:', Body);
    console.log('Message ID:', MessageSid);
    console.log('Status:', MessageStatus || SmsStatus);
    
    // Update message status in database if it exists
    const status = MessageStatus || SmsStatus;
    if (MessageSid && status) {
      await query(
        `UPDATE whatsapp_messages 
         SET status = $1, 
             delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END,
             read_at = CASE WHEN $1 = 'read' THEN NOW() ELSE read_at END
         WHERE whatsapp_message_id = $2`,
        [status, MessageSid]
      );
    }
    
    // Respond to WhatsApp (required)
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

// GET endpoint - For Meta webhook verification
router.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  if (mode === 'subscribe' && token && token === config.whatsapp.webhookVerifyToken) {
    console.log('✅ Meta WhatsApp webhook verified successfully');
    return res.status(200).send(challenge || '');
  }

  console.warn('⚠️ Meta WhatsApp webhook verification failed', {
    mode,
    tokenProvided: Boolean(token),
  });

  return res.status(403).send('Verification failed');
});

// Health check
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'whatsapp' });
});

export default router;

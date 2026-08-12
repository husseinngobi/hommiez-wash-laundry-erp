import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

/**
 * Notifications use a junction table (notification_reads) so each user's
 * read/unread status is independent — marking a broadcast notification as
 * read for one admin does not affect other admins.
 */

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { limit = 50, offset = 0 } = req.query;

    const result = await query(
      `SELECT n.id, n.type, n.title, n.message, n.link, n.created_at,
              u.full_name as sender_name,
              CASE WHEN nr.user_id IS NOT NULL THEN TRUE ELSE FALSE END as is_read
       FROM notifications n
       LEFT JOIN users u ON n.sender_id = u.id
       LEFT JOIN notification_reads nr
         ON nr.notification_id = n.id AND nr.user_id = $1
       WHERE (n.user_id = $1 OR n.user_id IS NULL)
         AND (n.sender_id != $1 OR n.sender_id IS NULL)
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const result = await query(
      `SELECT COUNT(*) as count
       FROM notifications n
       LEFT JOIN notification_reads nr
         ON nr.notification_id = n.id AND nr.user_id = $1
       WHERE (n.user_id = $1 OR n.user_id IS NULL)
         AND (n.sender_id != $1 OR n.sender_id IS NULL)
         AND nr.user_id IS NULL`,
      [userId]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Verify the notification is visible to this user before marking read
    const check = await query(
      `SELECT id FROM notifications
       WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
      [id, userId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await query(
      `INSERT INTO notification_reads (notification_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (notification_id, user_id) DO NOTHING`,
      [id, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    await query(
      `INSERT INTO notification_reads (notification_id, user_id)
       SELECT n.id, $1
       FROM notifications n
       LEFT JOIN notification_reads nr
         ON nr.notification_id = n.id AND nr.user_id = $1
       WHERE (n.user_id = $1 OR n.user_id IS NULL)
         AND (n.sender_id != $1 OR n.sender_id IS NULL)
         AND nr.user_id IS NULL
       ON CONFLICT (notification_id, user_id) DO NOTHING`,
      [userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
};

export const createNotification = async (req: AuthRequest, res: Response) => {
  try {
    const senderId = req.user?.id;
    const { user_id, type, title, message, link } = req.body;

    if (!type || !title) {
      return res.status(400).json({ error: 'Type and title are required' });
    }

    if (type === 'ANNOUNCEMENT') {
      const usersResult = await query('SELECT id FROM users');
      const userIds = usersResult.rows.map((row: any) => row.id);

      const insertPromises = userIds.map((uid: number) =>
        query(
          `INSERT INTO notifications (user_id, sender_id, type, title, message, is_read)
           VALUES ($1, $2, $3, $4, $5, FALSE)`,
          [uid, senderId, type, title, message || '']
        )
      );

      await Promise.all(insertPromises);

      return res.status(201).json({
        message: 'Announcement sent successfully',
        recipients: userIds.length,
      });
    }

    const result = await query(
      `INSERT INTO notifications (user_id, sender_id, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user_id || null, senderId, type, title, message, link]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const result = await query(
      `DELETE FROM notifications
       WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)
       RETURNING id`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

export const createSystemNotification = async (
  type: string,
  title: string,
  message: string,
  link?: string,
  userId?: number
) => {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId || null, type, title, message, link || null]
    );
  } catch (error) {
    console.error('Create system notification error:', error);
  }
};

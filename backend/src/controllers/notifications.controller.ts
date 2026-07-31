import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { limit = 50, offset = 0 } = req.query;

    const result = await query(
      `SELECT n.id, n.type, n.title, n.message, n.link, n.is_read, n.created_at,
              u.full_name as sender_name
       FROM notifications n
       LEFT JOIN users u ON n.sender_id = u.id
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
      // Must mirror getNotifications exactly, or the badge counts items the
      // dropdown will never show.
      `SELECT COUNT(*) as count
       FROM notifications
       WHERE (user_id = $1 OR user_id IS NULL)
         AND (sender_id != $1 OR sender_id IS NULL)
         AND is_read = FALSE`,
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

    await query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
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
      `UPDATE notifications
       SET is_read = TRUE
       WHERE (user_id = $1 OR user_id IS NULL) AND is_read = FALSE`,
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

    // Validate required fields
    if (!type || !title) {
      return res.status(400).json({ error: 'Type and title are required' });
    }

    // If type is ANNOUNCEMENT, send to all staff users
    if (type === 'ANNOUNCEMENT') {
      // Get all users to send notification to
      const usersResult = await query('SELECT id FROM users');
      const userIds = usersResult.rows.map((row: any) => row.id);

      // Create notification for each user
      const insertPromises = userIds.map((userId: number) =>
        query(
          `INSERT INTO notifications (user_id, sender_id, type, title, message, is_read)
           VALUES ($1, $2, $3, $4, $5, FALSE)`,
          [userId, senderId, type, title, message || '']
        )
      );

      await Promise.all(insertPromises);

      return res.status(201).json({ 
        message: 'Announcement sent successfully',
        recipients: userIds.length
      });
    }

    // Regular notification for specific user
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

    // Only allow users to delete their own notifications
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

// Helper function to create system notifications (can be called from other controllers)
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

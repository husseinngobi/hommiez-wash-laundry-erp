import { query } from '../config/database';

/**
 * Notification Service
 * Centralized service for creating notifications across the application
 */

interface CreateNotificationParams {
  type: 'BACKUP_SUCCESS' | 'BACKUP_FAILED' | 'BACKUP_EMAIL_SENT' | 'ANNOUNCEMENT' | 'ORDER' | 'PAYMENT' | 'DELIVERY' | 'EXPENSE' | 'REFUND_REQUEST' | 'SYSTEM_ALERT';
  title: string;
  message: string;
  user_ids?: number[]; // Optional: specific users to notify
  notify_all_users?: boolean; // Optional: notify all active users
  notify_admins_only?: boolean; // Optional: notify only admins
  link?: string; // Optional: URL for navigation on click
  sender_id?: number; // Optional: ID of user who triggered notification
}

/**
 * Create notification(s) for user(s)
 */
export async function createNotification(params: CreateNotificationParams): Promise<boolean> {
  try {
    const { type, title, message, user_ids, notify_all_users, notify_admins_only, link, sender_id } = params;

    let targetUserIds: number[] = [];

    // Determine which users to notify
    if (notify_admins_only) {
      const adminResult = await query(
        `SELECT id FROM users WHERE role = $1 AND status = 'ACTIVE'`,
        ['ADMIN']
      );
      targetUserIds = adminResult.rows.map((row: any) => row.id);
    } else if (notify_all_users) {
      const allUsersResult = await query(
        `SELECT id FROM users WHERE status = 'ACTIVE'`
      );
      targetUserIds = allUsersResult.rows.map((row: any) => row.id);
    } else if (user_ids && user_ids.length > 0) {
      targetUserIds = user_ids;
    } else {
      console.warn('⚠️ No users to notify - skipping notification creation');
      return false;
    }

    if (targetUserIds.length === 0) {
      console.warn('⚠️ No active users found to notify');
      return false;
    }

    // Insert notification for each target user
    for (const userId of targetUserIds) {
      await query(
        `INSERT INTO notifications (user_id, sender_id, type, title, message, link, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, false, CURRENT_TIMESTAMP)`,
        [userId, sender_id || null, type, title, message, link || null]
      );
    }

    console.log(`✅ Notification sent to ${targetUserIds.length} user(s): ${title}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to create notification:', error);
    return false;
  }
}

/**
 * Get all admin user IDs
 */
export async function getAllAdminIds(): Promise<number[]> {
  try {
    const result = await query(
      `SELECT id FROM users WHERE role = $1 AND status = 'ACTIVE'`,
      ['ADMIN']
    );
    return result.rows.map((row: any) => row.id);
  } catch (error) {
    console.error('❌ Failed to fetch admin IDs:', error);
    return [];
  }
}

/**
 * Get all active user IDs
 */
export async function getAllUserIds(): Promise<number[]> {
  try {
    const result = await query(
      `SELECT id FROM users WHERE status = 'ACTIVE'`
    );
    return result.rows.map((row: any) => row.id);
  } catch (error) {
    console.error('❌ Failed to fetch user IDs:', error);
    return [];
  }
}

/**
 * Helper: Create backup success notification
 */
export async function notifyBackupSuccess(backupSize: string, backupType: string, userId?: number): Promise<boolean> {
  return createNotification({
    type: 'BACKUP_SUCCESS',
    title: 'Database Backup Created',
    message: `${backupType} backup completed successfully. Size: ${backupSize}`,
    notify_admins_only: true,
    link: '/settings?tab=data-management',
    sender_id: userId
  });
}

/**
 * Helper: Create backup failure notification
 */
export async function notifyBackupFailure(errorMessage: string, userId?: number): Promise<boolean> {
  return createNotification({
    type: 'BACKUP_FAILED',
    title: 'Database Backup Failed',
    message: `Backup creation failed: ${errorMessage}`,
    notify_admins_only: true,
    link: '/settings?tab=data-management',
    sender_id: userId
  });
}

/**
 * Helper: Create daily backup email notification
 */
export async function notifyDailyBackupSent(recipientCount: number, ordersCount: number, customersCount: number): Promise<boolean> {
  return createNotification({
    type: 'BACKUP_EMAIL_SENT',
    title: 'Daily Backup Sent',
    message: `Daily transaction backup sent to ${recipientCount} administrator(s). Includes ${ordersCount} orders and ${customersCount} customers.`,
    notify_admins_only: true,
    link: '/settings?tab=data-management'
  });
}

/**
 * Helper: Create daily backup email failure notification
 */
export async function notifyDailyBackupFailed(errorMessage: string): Promise<boolean> {
  return createNotification({
    type: 'BACKUP_FAILED',
    title: 'Daily Backup Email Failed',
    message: `Failed to send daily backup email: ${errorMessage}`,
    notify_admins_only: true,
    link: '/settings?tab=data-management'
  });
}

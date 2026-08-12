import { query } from '../config/database';

/**
 * Adds a notification_reads junction table so that each user's read/unread
 * status is tracked independently.
 *
 * Previously, broadcast notifications (user_id IS NULL) used a single is_read
 * column on the notifications row — so when one admin marked it read, it
 * appeared read for *all* admins. This migration introduces per-user tracking:
 * a row in notification_reads means that user has read that notification.
 *
 * Existing user-specific rows already marked is_read = TRUE are backfilled so
 * those users don't see everything as unread after the migration.
 */
export async function ensureNotificationReads(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id INTEGER NOT NULL
        REFERENCES notifications(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (notification_id, user_id)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_notification_reads_user
      ON notification_reads (user_id)
  `);

  // Backfill: mark existing is_read=TRUE user-specific notifications as read
  // for their owner, so they don't reappear as unread.
  await query(`
    INSERT INTO notification_reads (notification_id, user_id)
    SELECT id, user_id
    FROM notifications
    WHERE is_read = TRUE AND user_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `);

  console.log('✅ notification_reads table ready (per-user read tracking)');
}

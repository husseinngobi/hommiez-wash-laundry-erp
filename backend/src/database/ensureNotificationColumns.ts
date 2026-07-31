import { query } from '../config/database';

/**
 * Different setup scripts created the notifications table with different shapes.
 * The application writes sender_id and link, and broadcasts use a NULL user_id,
 * so reconcile all three here rather than letting inserts fail silently.
 */
export async function ensureNotificationColumns(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(200) NOT NULL,
      message TEXT,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_id INTEGER`);
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(255)`);

  // Broadcast notifications are stored with a NULL user_id
  await query(`ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL`);

  await query(
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
       ON notifications (user_id, is_read)`
  );

  console.log('✅ Notification columns ready');
}

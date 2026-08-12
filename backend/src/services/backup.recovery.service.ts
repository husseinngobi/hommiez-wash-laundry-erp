import { query } from '../config/database';

/**
 * Backup failure recovery and retry mechanism
 * Tracks backup attempts and retries failed backups
 */

interface BackupAttempt {
  id?: number;
  backup_date: string;
  attempt_date: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  error_message?: string;
  retry_count: number;
}

/**
 * Initialize the automated_backup_dates table
 */
export const initializeBackupTracking = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS automated_backup_dates (
        id SERIAL PRIMARY KEY,
        backup_date DATE NOT NULL,
        attempt_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) NOT NULL,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        UNIQUE(backup_date)
      )
    `);
    console.log('✅ Backup tracking table initialized');
  } catch (error) {
    console.error('❌ Failed to initialize backup tracking:', error);
  }
};

/**
 * Record a backup attempt
 */
export const recordBackupAttempt = async (
  backupDate: string,
  status: 'SUCCESS' | 'FAILED',
  errorMessage?: string
) => {
  try {
    const existing = await query(
      'SELECT * FROM automated_backup_dates WHERE backup_date = $1',
      [backupDate]
    );

    if (existing.rows.length > 0) {
      await query(
        `UPDATE automated_backup_dates 
         SET status = $1, error_message = $2, attempt_date = CURRENT_TIMESTAMP, retry_count = retry_count + 1
         WHERE backup_date = $3`,
        [status, errorMessage, backupDate]
      );
    } else {
      await query(
        `INSERT INTO automated_backup_dates (backup_date, status, error_message, retry_count)
         VALUES ($1, $2, $3, 0)`,
        [backupDate, status, errorMessage]
      );
    }
  } catch (error) {
    console.error('❌ Failed to record backup attempt:', error);
  }
};

/**
 * Get all failed or pending backups from the last 7 days
 */
export const getFailedBackups = async (): Promise<BackupAttempt[]> => {
  try {
    const result = await query(`
      SELECT * FROM automated_backup_dates 
      WHERE status IN ('FAILED', 'PENDING')
        AND backup_date >= CURRENT_DATE - INTERVAL '7 days'
        AND retry_count < 3
      ORDER BY backup_date DESC
    `);
    return result.rows;
  } catch (error) {
    console.error('❌ Failed to get failed backups:', error);
    return [];
  }
};

/**
 * Check if today's backup has been completed
 */
export const isTodayBackupComplete = async (): Promise<boolean> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await query(
      `SELECT * FROM automated_backup_dates 
       WHERE backup_date = $1 AND status = 'SUCCESS'`,
      [today]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('❌ Failed to check today\'s backup:', error);
    return false;
  }
};

/**
 * Get backup statistics for the last 30 days
 */
export const getBackupStats = async () => {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total_attempts,
        COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending
      FROM automated_backup_dates
      WHERE backup_date >= CURRENT_DATE - INTERVAL '30 days'
    `);
    return result.rows[0];
  } catch (error) {
    console.error('❌ Failed to get backup stats:', error);
    return null;
  }
};

/**
 * Mark a backup as pending (to be attempted)
 */
export const markBackupPending = async (backupDate: string) => {
  try {
    await query(
      `INSERT INTO automated_backup_dates (backup_date, status)
       VALUES ($1, 'PENDING')
       ON CONFLICT (backup_date) DO NOTHING`,
      [backupDate]
    );
  } catch (error) {
    console.error('❌ Failed to mark backup as pending:', error);
  }
};
import cron from 'node-cron';
import { query } from '../config/database';
import { emailBackupService } from './email-backup.service';
import {
  initializeBackupTracking,
  recordBackupAttempt,
  getFailedBackups,
  isTodayBackupComplete,
} from './backup.recovery.service';

/**
 * Core backup run logic — shared between the midnight cron and startup recovery.
 * Sends a backup email for the given `reportDate` (the day being reported on),
 * plus any previously failed/missed dates, combined into one email.
 */
async function runBackup(reportDate: string): Promise<void> {
  const settingsResult = await query('SELECT * FROM backup_email_settings LIMIT 1');
  const emailEnabled = settingsResult.rows.length > 0 && settingsResult.rows[0].enabled;

  if (!emailEnabled) {
    console.log('⏭️  Automatic email backups disabled in Settings — skipping');
    return;
  }

  const failedBackups = await getFailedBackups();
  const failedDates = failedBackups.map((f: { backup_date: string }) => f.backup_date);
  const alreadyDone = await isTodayBackupComplete();

  const datesToSend = alreadyDone
    ? failedDates
    : [...failedDates.filter((d) => d !== reportDate), reportDate];

  if (datesToSend.length === 0) {
    console.log('✅ Nothing to send — backup already done');
    return;
  }

  console.log(`📧 Sending backup covering: ${datesToSend.join(', ')}`);
  const result = await emailBackupService.sendDailyBackup(datesToSend);

  if (result.success) {
    for (const d of datesToSend) {
      await recordBackupAttempt(d, 'SUCCESS');
    }
    console.log(`✅ Backup sent — ${datesToSend.length} date(s) marked SUCCESS`);
  } else {
    await recordBackupAttempt(reportDate, 'FAILED', result.message);
    console.error(`❌ Backup send failed: ${result.message}`);
  }
}

/**
 * Automated backup scheduler.
 * 
 * Runs at midnight (Africa/Kampala) to email the previous day's summary.
 *
 * STARTUP RECOVERY: Render's free tier can put the server to sleep, meaning the
 * midnight cron may never fire. To compensate, 45 seconds after every server
 * start we check whether yesterday's backup was successfully sent; if it was
 * not, we send it immediately. This guarantees delivery even when the server
 * was sleeping at midnight.
 */
export const initializeBackupScheduler = async () => {
  await initializeBackupTracking();

  // ── Midnight cron ──────────────────────────────────────────────────────────
  cron.schedule('0 0 * * *', async () => {
    console.log('🕐 Midnight backup cron fired');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const reportDate = yesterday.toISOString().split('T')[0];
    try {
      await runBackup(reportDate);
    } catch (error: any) {
      console.error('❌ Midnight backup failed:', error);
      await recordBackupAttempt(reportDate, 'FAILED', error.message);
    }
  }, { timezone: 'Africa/Kampala' });

  // ── Startup recovery ───────────────────────────────────────────────────────
  // Wait 45 s for the DB pool to be fully ready, then check if last night's
  // backup was missed (e.g. server was sleeping at midnight).
  setTimeout(async () => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const reportDate = yesterday.toISOString().split('T')[0];

      // Check if yesterday's backup already succeeded
      const existing = await query(
        `SELECT status FROM automated_backup_dates
         WHERE backup_date = $1 AND status = 'SUCCESS'`,
        [reportDate]
      );

      if (existing.rows.length > 0) {
        console.log(`✅ Startup check: backup for ${reportDate} already sent — no recovery needed`);
        return;
      }

      console.log(`🔁 Startup recovery: backup for ${reportDate} was missed — sending now`);
      await runBackup(reportDate);
    } catch (err: any) {
      console.error('❌ Startup backup recovery failed:', err.message);
    }
  }, 45_000);

  console.log('📅 Backup scheduler ready (midnight cron + startup recovery)');
};
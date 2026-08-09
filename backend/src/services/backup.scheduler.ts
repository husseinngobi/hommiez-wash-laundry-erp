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
 * Automated backup scheduler.
 * Every day at 12:00 AM: checks Settings, and if enabled, sends a backup email
 * (via emailBackupService) covering today plus any unsent/failed days from the
 * last 7 days, combined into a single catch-up email if there's a backlog.
 */
export const initializeBackupScheduler = async () => {
  await initializeBackupTracking();

  cron.schedule('0 0 * * *', async () => {
    console.log('🕐 Checking automated backup settings...');
    const today = new Date().toISOString().split('T')[0];

    try {
      const settingsResult = await query('SELECT * FROM backup_email_settings LIMIT 1');
      const emailEnabled = settingsResult.rows.length > 0 && settingsResult.rows[0].enabled;

      if (!emailEnabled) {
        console.log('⏭️  Automatic email backups disabled in Settings — skipping');
        return;
      }

      // Collect today (if not already sent) plus any unsent/failed days from the last 7 days
      const failedBackups = await getFailedBackups();
      const failedDates = failedBackups.map((f) => f.backup_date);
      const alreadyDone = await isTodayBackupComplete();
      const datesToSend = alreadyDone
        ? failedDates
        : [...failedDates.filter((d) => d !== today), today];

      if (datesToSend.length === 0) {
        console.log('✅ Nothing to send today');
        return;
      }

      console.log(`📧 Sending backup covering: ${datesToSend.join(', ')}`);
      const result = await emailBackupService.sendDailyBackup(datesToSend);

      if (result.success) {
        for (const d of datesToSend) {
          await recordBackupAttempt(d, 'SUCCESS');
        }
        console.log(`✅ Backup sent and ${datesToSend.length} date(s) marked SUCCESS`);
      } else {
        await recordBackupAttempt(today, 'FAILED', result.message);
        console.error(`❌ Backup send failed: ${result.message}`);
      }
    } catch (error: any) {
      console.error('❌ Automated backup check failed:', error);
      await recordBackupAttempt(today, 'FAILED', error.message);
    }
  }, {
    timezone: 'Africa/Kampala',
  });

  console.log('📅 Automated backup scheduler initialized (checks daily at 12:00 AM)');
};
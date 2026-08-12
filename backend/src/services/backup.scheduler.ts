import cron from 'node-cron';
import { query } from '../config/database';
import { emailBackupService } from './email-backup.service';
import {
  initializeBackupTracking,
  recordBackupAttempt,
} from './backup.recovery.service';

type Frequency = 'daily' | 'weekly' | 'monthly';

/** Read the enabled/frequency from DB, returns null when backups are disabled. */
async function getSettings(): Promise<{ frequency: Frequency } | null> {
  try {
    const result = await query('SELECT enabled, frequency FROM backup_email_settings LIMIT 1');
    if (!result.rows.length || !result.rows[0].enabled) return null;
    const freq: Frequency = ['daily', 'weekly', 'monthly'].includes(result.rows[0].frequency)
      ? result.rows[0].frequency
      : 'daily';
    return { frequency: freq };
  } catch {
    return null;
  }
}

/**
 * Given a frequency and a reference "yesterday" Date, return:
 *  - reportDate: the canonical ID for this period (last day of the period), used
 *                for dedup in automated_backup_dates
 *  - dates: every individual date in the period to include in the PDF
 *  - shouldSend: whether today is the right day to trigger this frequency
 */
function getPeriod(
  frequency: Frequency,
  yesterday: Date
): { reportDate: string; dates: string[]; shouldSend: boolean } {
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  if (frequency === 'daily') {
    return { reportDate: fmt(yesterday), dates: [fmt(yesterday)], shouldSend: true };
  }

  if (frequency === 'weekly') {
    // Send on Monday midnight (yesterday = Sunday, getDay() === 0)
    const isSendDay = yesterday.getDay() === 0;
    // Build Mon–Sun dates for the week ending yesterday (Sunday)
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(yesterday);
      d.setDate(yesterday.getDate() - i);
      dates.push(fmt(d));
    }
    return { reportDate: fmt(yesterday), dates, shouldSend: isSendDay };
  }

  // monthly — send on the 1st (yesterday = last day of prev month)
  const lastDayOfPrevMonth = new Date(yesterday.getFullYear(), yesterday.getMonth() + 1, 0);
  const isSendDay = yesterday.getDate() === lastDayOfPrevMonth.getDate();
  const firstDay = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
  const dates: string[] = [];
  const cur = new Date(firstDay);
  while (cur <= yesterday) {
    dates.push(fmt(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return { reportDate: fmt(yesterday), dates, shouldSend: isSendDay };
}

/** Check if a reportDate is already recorded as SUCCESS. */
async function isAlreadySent(reportDate: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM automated_backup_dates WHERE backup_date = $1 AND status = 'SUCCESS'`,
    [reportDate]
  );
  return r.rows.length > 0;
}

/** Core: build and send the backup email, then record result. */
async function sendBackup(reportDate: string, dates: string[]): Promise<void> {
  console.log(`📧 Sending backup for period ending ${reportDate} (${dates.length} day(s))`);
  const result = await emailBackupService.sendDailyBackup(dates);
  if (result.success) {
    await recordBackupAttempt(reportDate, 'SUCCESS');
    console.log(`✅ Backup sent — period ending ${reportDate}`);
  } else {
    await recordBackupAttempt(reportDate, 'FAILED', result.message);
    console.error(`❌ Backup failed: ${result.message}`);
  }
}

/**
 * Automated backup scheduler.
 *
 * Respects the frequency saved in backup_email_settings:
 *   daily   → email every night at midnight covering the previous day
 *   weekly  → email every Monday midnight covering Mon–Sun of the past week
 *   monthly → email on the 1st of each month covering the full previous month
 *
 * STARTUP RECOVERY: Render's free tier puts the server to sleep, so the
 * midnight cron may never fire.  45 s after every server boot we check whether
 * the most recent expected report was sent; if not, we send it immediately.
 */
export const initializeBackupScheduler = async () => {
  await initializeBackupTracking();

  // ── Midnight cron (fires every night; frequency logic decides whether to send) ──
  cron.schedule('0 0 * * *', async () => {
    console.log('🕐 Midnight backup cron fired');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    try {
      const settings = await getSettings();
      if (!settings) {
        console.log('⏭️  Automatic email backups disabled — skipping');
        return;
      }

      const { reportDate, dates, shouldSend } = getPeriod(settings.frequency, yesterday);
      if (!shouldSend) {
        console.log(`⏭️  ${settings.frequency} backup: not the send day — skipping`);
        return;
      }

      if (await isAlreadySent(reportDate)) {
        console.log(`✅ Backup for ${reportDate} already sent — nothing to do`);
        return;
      }

      await sendBackup(reportDate, dates);
    } catch (err: any) {
      console.error('❌ Midnight backup failed:', err.message);
      const yd = new Date();
      yd.setDate(yd.getDate() - 1);
      await recordBackupAttempt(yd.toISOString().split('T')[0], 'FAILED', err.message);
    }
  }, { timezone: 'Africa/Kampala' });

  // ── Startup recovery ────────────────────────────────────────────────────────
  setTimeout(async () => {
    try {
      const settings = await getSettings();
      if (!settings) return;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const { reportDate, dates } = getPeriod(settings.frequency, yesterday);

      if (await isAlreadySent(reportDate)) {
        console.log(`✅ Startup check: ${settings.frequency} backup for ${reportDate} already sent`);
        return;
      }

      console.log(`🔁 Startup recovery: ${settings.frequency} backup for ${reportDate} was missed — sending now`);
      await sendBackup(reportDate, dates);
    } catch (err: any) {
      console.error('❌ Startup backup recovery failed:', err.message);
    }
  }, 45_000);

  console.log('📅 Backup scheduler ready — frequency is read from Settings at each run');
};
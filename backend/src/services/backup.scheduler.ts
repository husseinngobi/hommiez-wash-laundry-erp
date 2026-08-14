import cron from 'node-cron';
import { query } from '../config/database';
import { emailBackupService } from './email-backup.service';
import {
  initializeBackupTracking,
  recordBackupAttempt,
} from './backup.recovery.service';

type Frequency = 'daily' | 'weekly' | 'monthly';

const KAMPALA_OFFSET_MS = 3 * 60 * 60 * 1000;
const CATCH_UP_DAYS = 7;

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

function ymd(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addUtcDays(ymdDate: string, delta: number): string {
  const d = new Date(`${ymdDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return ymd(d);
}

/** Today's calendar date in Africa/Kampala (UTC+3), as YYYY-MM-DD. */
function getKampalaTodayYmd(): string {
  const kampalaNow = new Date(Date.now() + KAMPALA_OFFSET_MS);
  return ymd(new Date(Date.UTC(
    kampalaNow.getUTCFullYear(),
    kampalaNow.getUTCMonth(),
    kampalaNow.getUTCDate()
  )));
}

/**
 * Returns "yesterday" as a Date, correctly computed in Africa/Kampala (UTC+3)
 * local time, regardless of when this is called (cron, boot, etc).
 *
 * At Kampala midnight the UTC clock is still the previous calendar day.
 * Using server-local `setDate(getDate() - 1)` therefore skipped a day and
 * treated the just-ended Kampala day as already sent.
 */
function getKampalaYesterday(): Date {
  return new Date(`${addUtcDays(getKampalaTodayYmd(), -1)}T00:00:00.000Z`);
}

function getKampalaYesterdayYmd(): string {
  return addUtcDays(getKampalaTodayYmd(), -1);
}

/**
 * Last N completed Kampala calendar days, oldest → newest
 * (does not include today).
 */
function lastCompletedKampalaDays(n: number): string[] {
  const yesterday = getKampalaYesterdayYmd();
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    dates.push(addUtcDays(yesterday, -i));
  }
  return dates;
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
    // Send on Monday midnight (yesterday = Sunday, getUTCDay() === 0 — Date is UTC midnight)
    const isSendDay = yesterday.getUTCDay() === 0;
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(yesterday);
      d.setUTCDate(yesterday.getUTCDate() - i);
      dates.push(fmt(d));
    }
    return { reportDate: fmt(yesterday), dates, shouldSend: isSendDay };
  }

  // monthly — send on the 1st (yesterday = last day of prev month)
  const y = yesterday.getUTCFullYear();
  const m = yesterday.getUTCMonth();
  const lastDayOfPrevMonth = new Date(Date.UTC(y, m + 1, 0));
  const isSendDay = yesterday.getUTCDate() === lastDayOfPrevMonth.getUTCDate();
  const dates: string[] = [];
  const cur = new Date(Date.UTC(y, m, 1));
  while (cur <= yesterday) {
    dates.push(fmt(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
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

/**
 * Dates in the last N completed Kampala days that are missing from
 * automated_backup_dates or not marked SUCCESS (FAILED / PENDING).
 */
async function getUnsentDatesInWindow(days: number): Promise<string[]> {
  const window = lastCompletedKampalaDays(days);
  const result = await query(
    `SELECT backup_date::text AS backup_date, status
     FROM automated_backup_dates
     WHERE backup_date = ANY($1::date[])`,
    [window]
  );

  const success = new Set(
    result.rows
      .filter((row: { status: string }) => row.status === 'SUCCESS')
      .map((row: { backup_date: string }) => String(row.backup_date).slice(0, 10))
  );

  return window.filter((d) => !success.has(d));
}

async function recordBatch(dates: string[], status: 'SUCCESS' | 'FAILED', errorMessage?: string): Promise<void> {
  for (const date of dates) {
    await recordBackupAttempt(date, status, errorMessage);
  }
}

/** Core: build and send one email (single- or multi-day PDF), then record every date. */
async function sendBackup(dates: string[]): Promise<void> {
  if (dates.length === 0) return;

  const sorted = [...dates].sort();
  console.log(`📧 Sending backup for ${sorted.length} day(s): ${sorted.join(', ')}`);
  const result = await emailBackupService.sendDailyBackup(sorted);

  if (result.success) {
    await recordBatch(sorted, 'SUCCESS');
    console.log(`✅ Backup sent — ${sorted.length} day(s) marked SUCCESS`);
  } else {
    await recordBatch(sorted, 'FAILED', result.message);
    console.error(`❌ Backup failed: ${result.message}`);
  }
}

/**
 * Daily: look back 7 completed Kampala days and send one combined PDF
 * for every date that is missing or not SUCCESS.
 * Weekly / monthly: send the current period if it is the send day and not yet SUCCESS.
 */
async function runBackupCheck(source: 'cron' | 'startup'): Promise<void> {
  const settings = await getSettings();
  if (!settings) {
    if (source === 'cron') {
      console.log('⏭️  Automatic email backups disabled — skipping');
    }
    return;
  }

  if (settings.frequency === 'daily') {
    const missing = await getUnsentDatesInWindow(CATCH_UP_DAYS);
    if (missing.length === 0) {
      console.log(`✅ ${source}: last ${CATCH_UP_DAYS} days already marked SUCCESS`);
      return;
    }
    console.log(
      `🔁 ${source}: ${missing.length} day(s) not yet SUCCESS — sending one combined backup (${missing.join(', ')})`
    );
    await sendBackup(missing);
    return;
  }

  const yesterday = getKampalaYesterday();
  const { reportDate, dates, shouldSend } = getPeriod(settings.frequency, yesterday);

  if (source === 'cron' && !shouldSend) {
    console.log(`⏭️  ${settings.frequency} backup: not the send day — skipping`);
    return;
  }

  if (await isAlreadySent(reportDate)) {
    console.log(`✅ ${source}: ${settings.frequency} backup for ${reportDate} already sent`);
    return;
  }

  if (source === 'cron' || shouldSend || !(await isAlreadySent(reportDate))) {
    console.log(`🔁 ${source}: ${settings.frequency} backup for ${reportDate} was missed — sending now`);
    await sendBackup(dates);
  }
}

/**
 * Automated backup scheduler.
 *
 * Respects the frequency saved in backup_email_settings:
 *   daily   → email every night at midnight covering missed days in the last 7
 *   weekly  → email every Monday midnight covering Mon–Sun of the past week
 *   monthly → email on the 1st of each month covering the full previous month
 *
 * STARTUP RECOVERY: Render's free tier puts the server to sleep, so the
 * midnight cron may never fire.  45 s after every server boot we check the
 * last 7 completed Kampala days (daily) or the current period (weekly/monthly).
 */
export const initializeBackupScheduler = async () => {
  await initializeBackupTracking();

  cron.schedule('0 0 * * *', async () => {
    console.log('🕐 Midnight backup cron fired');
    try {
      await runBackupCheck('cron');
    } catch (err: any) {
      console.error('❌ Midnight backup failed:', err.message);
      try {
        const missing = await getUnsentDatesInWindow(CATCH_UP_DAYS);
        const dates = missing.length > 0 ? missing : [getKampalaYesterdayYmd()];
        await recordBatch(dates, 'FAILED', err.message);
      } catch (recordErr: any) {
        console.error('❌ Failed to record midnight backup failure:', recordErr.message);
      }
    }
  }, { timezone: 'Africa/Kampala' });

  setTimeout(async () => {
    try {
      await runBackupCheck('startup');
    } catch (err: any) {
      console.error('❌ Startup backup recovery failed:', err.message);
    }
  }, 45_000);

  console.log('📅 Backup scheduler ready — frequency is read from Settings at each run');
};

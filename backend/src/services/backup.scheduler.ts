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

/** Most recent completed Mon–Sun week in Kampala (Sunday ≤ yesterday). */
function lastCompletedWeekDates(): string[] {
  const yesterday = getKampalaYesterdayYmd();
  const dow = new Date(`${yesterday}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday
  const sunday = addUtcDays(yesterday, -dow);
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    dates.push(addUtcDays(sunday, -i));
  }
  return dates;
}

/** All days of the last completed calendar month in Kampala. */
function lastCompletedMonthDates(): string[] {
  const yesterday = getKampalaYesterdayYmd();
  const d = new Date(`${yesterday}T00:00:00.000Z`);
  const lastDayOfThatMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  const monthEnd = yesterday === ymd(lastDayOfThatMonth)
    ? yesterday
    : ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)));
  const end = new Date(`${monthEnd}T00:00:00.000Z`);
  const cursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const dates: string[] = [];
  while (cursor <= end) {
    dates.push(ymd(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** True at Kampala 1st of month midnight (yesterday = last day of previous month). */
function isMonthlySendDay(): boolean {
  const yesterday = getKampalaYesterdayYmd();
  const d = new Date(`${yesterday}T00:00:00.000Z`);
  const lastDay = ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  return yesterday === lastDay;
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

async function getUnsentAmong(dates: string[]): Promise<string[]> {
  if (dates.length === 0) return [];
  const result = await query(
    `SELECT backup_date::text AS backup_date, status
     FROM automated_backup_dates
     WHERE backup_date = ANY($1::date[])`,
    [dates]
  );
  const success = new Set(
    result.rows
      .filter((row: { status: string }) => row.status === 'SUCCESS')
      .map((row: { backup_date: string }) => String(row.backup_date).slice(0, 10))
  );
  return dates.filter((d) => !success.has(d));
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
 * Daily: last 7 unsent days → one PDF.
 * Weekly: last completed Mon–Sun → one PDF (missed daily days are pages in that week).
 *         If you switch mid-week, leftover unsent days in the last 7 also go out as one PDF.
 * Monthly: last completed calendar month → one PDF.
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
      `🔁 ${source}: daily — ${missing.length} day(s) not SUCCESS — one combined PDF (${missing.join(', ')})`
    );
    await sendBackup(missing);
    return;
  }

  if (settings.frequency === 'weekly') {
    const week = lastCompletedWeekDates();
    const missingInWeek = await getUnsentAmong(week);
    const missingRecent = await getUnsentDatesInWindow(CATCH_UP_DAYS);

    if (missingInWeek.length > 0) {
      console.log(
        `🔁 ${source}: weekly — one PDF for ${week[0]} to ${week[6]} (missed daily days are pages in this week)`
      );
      await sendBackup(week);
      return;
    }

    if (source === 'startup' && missingRecent.length > 0) {
      console.log(
        `🔁 ${source}: weekly (after schedule change) — one PDF for leftover days (${missingRecent.join(', ')})`
      );
      await sendBackup(missingRecent);
      return;
    }

    console.log(`✅ ${source}: weekly — last week ${week[0]} to ${week[6]} already complete`);
    return;
  }

  const month = lastCompletedMonthDates();
  const missingInMonth = await getUnsentAmong(month);
  const sendDay = isMonthlySendDay();

  if (sendDay && (source === 'cron' || missingInMonth.length > 0)) {
    console.log(`🔁 ${source}: monthly digest — one PDF for ${month[0]} to ${month[month.length - 1]}`);
    await sendBackup(month);
    return;
  }

  if (missingInMonth.length > 0) {
    console.log(
      `🔁 ${source}: monthly catch-up — one PDF for ${month[0]} to ${month[month.length - 1]} (includes missed days)`
    );
    await sendBackup(month);
    return;
  }

  console.log(`✅ ${source}: monthly period already complete`);
}

/**
 * Automated backup scheduler.
 *
 * Respects the frequency saved in backup_email_settings:
 *   daily   → one PDF covering any unsent days in the last 7
 *   weekly  → one PDF for the last completed Mon–Sun (missed daily days are pages in that week)
 *   monthly → one PDF for the last completed calendar month
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

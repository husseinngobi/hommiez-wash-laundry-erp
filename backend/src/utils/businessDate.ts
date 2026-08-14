/**
 * Calendar dates for historical orders/payments must stay on the day the
 * cashier picked (Africa/Nairobi), not shift to UTC midnight or "now".
 */
export function kampalaTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Calendar day in Uganda (YYYY-MM-DD) for a Date.
 */
export function toKampalaYmd(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * YYYY-MM-DD from a date picker value, ISO string, or Date. Rejects future days.
 */
export function extractYmd(dateInput: unknown): string | null {
  if (dateInput == null || dateInput === '') return null;

  if (dateInput instanceof Date) {
    if (Number.isNaN(dateInput.getTime())) return null;
    const ymd = toKampalaYmd(dateInput);
    return ymd > kampalaTodayYmd() ? null : ymd;
  }

  const raw = String(dateInput).trim();
  const ymdMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    const ymd = `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
    return ymd > kampalaTodayYmd() ? null : ymd;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const ymd = toKampalaYmd(parsed);
  return ymd > kampalaTodayYmd() ? null : ymd;
}

/** Naive noon timestamp for TIMESTAMP columns (avoids UTC shift to "today"). */
export function ymdToPgTimestamp(ymd: string): string {
  return `${ymd} 12:00:00`;
}

/**
 * Accepts YYYY-MM-DD or an ISO datetime. Returns a Date at noon Nairobi
 * so DATE(payment_date) matches the chosen day. Rejects future calendar days.
 */
export function calendarDateToTimestamp(dateInput: unknown): Date | null {
  const ymd = extractYmd(dateInput);
  if (!ymd) return null;
  const parsed = new Date(`${ymd}T12:00:00+03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

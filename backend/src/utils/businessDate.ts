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
 * Accepts YYYY-MM-DD or an ISO datetime. Returns a Date at noon Nairobi
 * so DATE(payment_date) matches the chosen day. Rejects future calendar days.
 */
export function calendarDateToTimestamp(dateInput: unknown): Date | null {
  if (dateInput == null || dateInput === '') return null;
  const raw = String(dateInput).trim();
  const ymdMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const ymd = ymdMatch ? `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}` : null;

  if (ymd) {
    if (ymd > kampalaTodayYmd()) return null;
    const parsed = new Date(`${ymd}T12:00:00+03:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

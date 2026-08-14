const KAMPALA_TZ = 'Africa/Nairobi';

/** Today's calendar date in Uganda (YYYY-MM-DD). */
export function kampalaTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KAMPALA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Calendar day in Uganda for an ISO timestamp (YYYY-MM-DD). */
export function toKampalaYmd(value: string | Date | null | undefined): string {
  if (!value) return kampalaTodayYmd();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return kampalaTodayYmd();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KAMPALA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatKampalaDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const raw = typeof value === 'string' ? value : value.toISOString();
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const date = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T12:00:00+03:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', {
        timeZone: KAMPALA_TZ,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    timeZone: KAMPALA_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatKampalaDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    timeZone: KAMPALA_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

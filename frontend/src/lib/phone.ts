/** Normalize digits only */
export function digitsOnly(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

const COUNTRY_CODE_HINT =
  'Please include the country code (e.g. +256700123456 for Uganda)';

/**
 * Normalize customer phone to E.164 (+country…).
 * Accepts +256…, 256…, and common Uganda local forms (07… / 7…).
 */
export function formatCustomerPhone(
  phone: string
): { ok: true; e164: string } | { ok: false; message: string } {
  const raw = String(phone || '').trim();
  if (!raw) {
    return { ok: false, message: 'Phone number is required' };
  }

  const hasPlus = raw.trimStart().startsWith('+');
  const digits = digitsOnly(raw);

  if (!digits) {
    return { ok: false, message: COUNTRY_CODE_HINT };
  }

  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, message: COUNTRY_CODE_HINT };
    }
    return { ok: true, e164: `+${digits}` };
  }

  if (digits.startsWith('256') && digits.length === 12) {
    return { ok: true, e164: `+${digits}` };
  }

  if (digits.startsWith('0') && digits.length === 10) {
    return { ok: true, e164: `+256${digits.slice(1)}` };
  }
  if (digits.startsWith('7') && digits.length === 9) {
    return { ok: true, e164: `+256${digits}` };
  }

  return { ok: false, message: COUNTRY_CODE_HINT };
}

export const DEFAULT_BARGAIN_LIMITS = {
  DESKTOP_AGENT: 5000,
  MANAGER: 10000,
  ADMIN: 50000,
} as const;

export const MAX_DISCOUNT_BY_ROLE = {
  DESKTOP_AGENT: 10,
  MANAGER: 20,
  ADMIN: 50,
} as const;

export function getEffectiveBargainLimit(
  role: string,
  storedLimit: number | null | undefined
): number {
  const limit = Number(storedLimit) || 0;
  if (limit > 0) {
    return limit;
  }

  return DEFAULT_BARGAIN_LIMITS[role as keyof typeof DEFAULT_BARGAIN_LIMITS] ?? 0;
}

export function getMaxDiscountForRole(role: string): number {
  return MAX_DISCOUNT_BY_ROLE[role as keyof typeof MAX_DISCOUNT_BY_ROLE] ?? 10;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function normalizeCustomerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

const COUNTRY_CODE_HINT =
  'Please include the country code (e.g. +256700123456 for Uganda)';

/**
 * Normalize customer phone to E.164 (+country…).
 * Accepts +256…, 256…, and common Uganda local forms (07… / 7…).
 * Rejects numbers with no recognizable country code.
 */
export function formatCustomerPhone(
  phone: string
): { ok: true; e164: string } | { ok: false; message: string } {
  const raw = String(phone || '').trim();
  if (!raw) {
    return { ok: false, message: 'Phone number is required' };
  }

  const hasPlus = raw.trimStart().startsWith('+');
  const digits = normalizePhone(raw);

  if (!digits) {
    return { ok: false, message: COUNTRY_CODE_HINT };
  }

  // Already international with +
  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, message: COUNTRY_CODE_HINT };
    }
    return { ok: true, e164: `+${digits}` };
  }

  // Uganda: 256XXXXXXXXX (12 digits)
  if (digits.startsWith('256') && digits.length === 12) {
    return { ok: true, e164: `+${digits}` };
  }

  // Uganda local: 07XXXXXXXX (10 digits) or 7XXXXXXXX (9 digits)
  if (digits.startsWith('0') && digits.length === 10) {
    return { ok: true, e164: `+256${digits.slice(1)}` };
  }
  if (digits.startsWith('7') && digits.length === 9) {
    return { ok: true, e164: `+256${digits}` };
  }

  return { ok: false, message: COUNTRY_CODE_HINT };
}

const COUNTRY_CODE_HINT = 'Please add the country code (e.g. +256 for Uganda)';

/**
 * Normalize customer phone to E.164 (+country…).
 * Accepts +256…, 256…, and common Uganda local forms (07… / 7…).
 * Rejects numbers with no usable country code.
 */
export function toCustomerPhoneE164(input: string): { ok: true; phone: string } | { ok: false; message: string } {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    return { ok: false, message: 'Phone number is required' };
  }

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (!/^[1-9]\d{7,14}$/.test(digits)) {
      return { ok: false, message: COUNTRY_CODE_HINT };
    }
    return { ok: true, phone: `+${digits}` };
  }

  const digits = trimmed.replace(/\D/g, '');

  // Uganda local: 07XXXXXXXX or 7XXXXXXXX
  if (/^0?7\d{8}$/.test(digits)) {
    const national = digits.startsWith('0') ? digits.slice(1) : digits;
    return { ok: true, phone: `+256${national}` };
  }

  // Uganda without +: 256XXXXXXXXX
  if (/^256\d{9}$/.test(digits)) {
    return { ok: true, phone: `+${digits}` };
  }

  return { ok: false, message: COUNTRY_CODE_HINT };
}

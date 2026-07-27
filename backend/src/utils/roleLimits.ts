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

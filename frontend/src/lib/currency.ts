/**
 * Shared currency formatting utility for Hommiez Wash Laundry and Dry Cleaners
 * All money values should use this function for consistent display
 */

const ugxFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format a number as UGX currency with commas
 * @param amount - The amount in whole units (not cents)
 * @returns Formatted string like "UGX 5,000"
 */
export const formatUGX = (amount: number | string | null | undefined): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  if (isNaN(num)) return 'UGX 0';
  return ugxFormatter.format(Math.round(num));
};

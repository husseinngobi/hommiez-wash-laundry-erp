import { formatUGX } from '@/lib/currency';

/** Normalize Uganda (and similar) phone numbers for wa.me */
export function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('0')) {
    cleaned = '256' + cleaned.substring(1);
  }

  if (!cleaned.startsWith('256') && cleaned.length <= 10) {
    cleaned = '256' + cleaned;
  }

  return cleaned;
}

export function openWhatsAppMessenger(phone: string, message: string): boolean {
  if (!phone?.trim()) return false;
  const formattedPhone = formatPhoneForWhatsApp(phone);
  if (!formattedPhone || formattedPhone.length < 10) return false;

  const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
  return true;
}

export type OrderWhatsAppPayload = {
  order_number: string;
  customer_name: string;
  created_at?: string;
  subtotal: number;
  discount_percentage?: number;
  discount_amount?: number;
  bargain_amount?: number;
  surcharge_amount?: number;
  tax_rate?: number;
  tax_amount?: number;
  total_amount: number;
  amount_paid: number;
  balance: number;
  payment_status?: string;
  payment_method?: string;
  order_status?: string;
  pickup_date?: string;
  branch_name?: string;
};

export type OrderWhatsAppItem = {
  item_name: string;
  service_type: string;
  quantity: number;
  total_price: number;
  discount_amount?: number;
  surcharge_amount?: number;
};

/** Business pay-in details shown on unpaid / partial / on-account receipts */
export type PaymentModeDetails = {
  centenary_account?: string;
  mtn_code?: string;
  airtel_merchant?: string;
};

export const DEFAULT_PAYMENT_MODES: Required<PaymentModeDetails> = {
  centenary_account: '3205564146',
  mtn_code: '30353491',
  airtel_merchant: '4403961',
};

/** Business identity from Settings → Business Information */
export type BusinessInfo = {
  name?: string;
  phone?: string;
  email?: string;
  location?: string;
  address?: string;
  branch_name?: string;
};

export const DEFAULT_BUSINESS_INFO: BusinessInfo = {
  name: 'LUSH DRY CLEANERS & LAUNDROMAT',
};

/** Free days to collect once an item is ready, before storage charges start */
export const COLLECTION_GRACE_DAYS = 3;

/** Months after which uncollected items are donated */
export const UNCOLLECTED_DONATION_MONTHS = 3;

export type OrderMessageKind = 'confirmation' | 'receipt' | 'ready' | 'delivered';

function formatShortDate(value?: string): string {
  if (!value) return new Date().toLocaleDateString('en-UG');
  try {
    return new Date(value).toLocaleDateString('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

function normalizedOrderStatus(order: OrderWhatsAppPayload): string {
  return String(order.order_status || '').trim().toLowerCase();
}

function isFullyPaid(order: OrderWhatsAppPayload): boolean {
  const status = String(order.payment_status || '').toUpperCase();
  return status === 'PAID' || Number(order.balance || 0) <= 0;
}

function shouldIncludePaymentModes(order: OrderWhatsAppPayload): boolean {
  if (isFullyPaid(order)) return false;
  const status = String(order.payment_status || '').toUpperCase();
  const method = String(order.payment_method || '').toUpperCase();
  return (
    status === 'UNPAID' ||
    status === 'PARTIAL' ||
    method === 'ON_ACCOUNT' ||
    Number(order.balance || 0) > 0
  );
}

function paymentMethodLabel(method?: string): string {
  if (!method) return '';
  if (method.toUpperCase() === 'ON_ACCOUNT') return 'On Account';
  return method.replace(/_/g, ' ');
}

function orderStatusLabel(order: OrderWhatsAppPayload): string {
  switch (normalizedOrderStatus(order)) {
    case 'pending':
      return 'Received';
    case 'processing':
      return 'In progress';
    case 'ready':
      return 'Ready for pickup';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return '';
  }
}

/**
 * Resolves which message to produce. A caller may ask for a 'receipt' on an
 * order that is already ready or delivered — the order status wins so we never
 * tell a customer their order is ready when it is still being processed.
 */
function resolveKind(order: OrderWhatsAppPayload, requested: OrderMessageKind): OrderMessageKind {
  const status = normalizedOrderStatus(order);

  if (requested === 'ready' || requested === 'delivered') {
    // Explicit notifications must match reality
    if (status === 'delivered') return 'delivered';
    if (status === 'ready') return 'ready';
    return 'receipt';
  }

  if (requested === 'receipt') {
    if (status === 'delivered') return 'delivered';
    if (status === 'ready') return 'ready';
  }

  return requested;
}

function headerFor(kind: OrderMessageKind): string {
  switch (kind) {
    case 'confirmation':
      return '*ORDER CONFIRMATION*';
    case 'ready':
      return '*YOUR ORDER IS READY FOR PICKUP*';
    case 'delivered':
      return '*DELIVERY CONFIRMATION*';
    default:
      return '*ORDER RECEIPT*';
  }
}

function buildItemLines(items: OrderWhatsAppItem[]): string[] {
  if (!items.length) return [];

  const lines = ['*ITEMS:*'];
  items.forEach((item, index) => {
    const discount = Number(item.discount_amount || 0);
    const surcharge = Number(item.surcharge_amount || 0);
    const hasAdj = discount > 0 || surcharge > 0;
    const gross = Number(item.total_price || 0) + discount - surcharge;
    if (hasAdj) {
      lines.push(
        `${index + 1}. ${item.item_name} (${item.service_type}) x ${item.quantity} — ${formatUGX(gross)}`
      );
      if (discount > 0) lines.push(`   Discount: -${formatUGX(discount)}`);
      if (surcharge > 0) lines.push(`   Price up: +${formatUGX(surcharge)}`);
      lines.push(`   → ${formatUGX(item.total_price)}`);
    } else {
      lines.push(
        `${index + 1}. ${item.item_name} (${item.service_type}) x ${item.quantity} — ${formatUGX(item.total_price)}`
      );
    }
  });
  lines.push('');
  return lines;
}

function buildPaymentSummaryLines(
  order: OrderWhatsAppPayload,
  items: OrderWhatsAppItem[] = []
): string[] {
  const lines = ['*PAYMENT SUMMARY*'];

  // Per-item discounts are already netted off each line total, so add them
  // back for a clear gross → discount → net story on the receipt.
  const itemDiscountTotal = items.reduce(
    (sum, item) => sum + Number(item.discount_amount || 0),
    0
  );
  const orderDiscount = Number(order.discount_amount || 0);
  const bargainDiscount = Number(order.bargain_amount || 0);
  const grossSubtotal = Number(order.subtotal || 0) + itemDiscountTotal;

  lines.push(`Subtotal: ${formatUGX(grossSubtotal)}`);

  if (itemDiscountTotal > 0) {
    lines.push(`Item discounts: -${formatUGX(itemDiscountTotal)}`);
  }
  if (Number(order.discount_percentage || 0) > 0 && orderDiscount > 0) {
    lines.push(`Order discount (${order.discount_percentage}%): -${formatUGX(orderDiscount)}`);
  } else if (orderDiscount > 0) {
    lines.push(`Order discount: -${formatUGX(orderDiscount)}`);
  }
  if (bargainDiscount > 0) {
    lines.push(`Bargain discount: -${formatUGX(bargainDiscount)}`);
  }

  const surcharge = Number(order.surcharge_amount || 0);
  const itemSurchargeTotal = items.reduce((sum, item) => sum + Number((item as any).surcharge_amount || 0), 0);
  const totalSurcharge = surcharge + itemSurchargeTotal;
  if (itemSurchargeTotal > 0) {
    lines.push(`Item price-ups: +${formatUGX(itemSurchargeTotal)}`);
  }
  if (surcharge > 0) {
    lines.push(`Order price up: +${formatUGX(surcharge)}`);
  }

  const totalDiscount = itemDiscountTotal + orderDiscount + bargainDiscount;
  if (totalDiscount > 0) {
    lines.push(`*You saved: ${formatUGX(totalDiscount)}*`);
  }

  if (Number(order.tax_amount || 0) > 0) {
    lines.push(`VAT (${order.tax_rate || 18}%): +${formatUGX(order.tax_amount || 0)}`);
  }

  lines.push(`*TOTAL: ${formatUGX(order.total_amount)}*`);
  lines.push(`Amount Paid: ${formatUGX(order.amount_paid)}`);

  if (Number(order.balance || 0) > 0) {
    lines.push(`*Balance Due: ${formatUGX(order.balance)}*`);
  } else {
    lines.push('Status: Fully Paid');
  }

  const method = paymentMethodLabel(order.payment_method);
  if (method) {
    lines.push(`Method: ${method}`);
  }

  return lines;
}

function buildPaymentRequestLines(
  order: OrderWhatsAppPayload,
  paymentModes?: PaymentModeDetails | null
): string[] {
  if (!shouldIncludePaymentModes(order)) return [];

  const modes = { ...DEFAULT_PAYMENT_MODES, ...(paymentModes || {}) };
  const lines = ['', '*HOW TO PAY*'];

  if (modes.centenary_account) lines.push(`Centenary account No: ${modes.centenary_account}`);
  if (modes.mtn_code) lines.push(`MTN code no: ${modes.mtn_code}`);
  if (modes.airtel_merchant) lines.push(`Airtel merchant no: ${modes.airtel_merchant}`);

  lines.push(`Kindly clear the balance of ${formatUGX(order.balance)}.`);
  return lines;
}

export function buildCollectionPolicyLines(): string[] {
  return [
    '',
    '*COLLECTION POLICY*',
    `Kindly collect your items within ${COLLECTION_GRACE_DAYS} days of this notice.`,
    'We do not have storage facilities for garments, so items held beyond',
    `${COLLECTION_GRACE_DAYS} days attract a storage charge and are kept at the owner's risk.`,
    `Items left uncollected for over ${UNCOLLECTED_DONATION_MONTHS} months are donated to charity.`,
    'Thank you for your understanding.',
  ];
}

function buildBusinessFooterLines(business?: BusinessInfo | null): string[] {
  const info = { ...DEFAULT_BUSINESS_INFO, ...(business || {}) };
  const lines: string[] = ['', '—'];

  if (info.name) lines.push(`*${info.name}*`);
  if (info.branch_name) lines.push(`Branch: ${info.branch_name}`);

  const place = [info.address, info.location].filter(Boolean).join(', ');
  if (place) lines.push(place);
  if (info.phone) lines.push(`Tel: ${info.phone}`);
  if (info.email) lines.push(`Email: ${info.email}`);

  // Nothing beyond the separator means there is no footer worth sending
  return lines.length > 2 ? lines : [];
}

/**
 * Compact payment summary for ready/delivered messages.
 * Shows only the key money figures — no per-item breakdown.
 */
function buildCompactPaymentLines(
  order: OrderWhatsAppPayload,
  paymentModes?: PaymentModeDetails | null
): string[] {
  const paid = isFullyPaid(order);
  const lines: string[] = ['*PAYMENT*'];

  lines.push(`Total charged: *${formatUGX(order.total_amount)}*`);
  if (Number(order.amount_paid || 0) > 0) {
    lines.push(`Amount paid: ${formatUGX(order.amount_paid)}`);
  }

  if (!paid && Number(order.balance || 0) > 0) {
    lines.push(`*Balance due: ${formatUGX(order.balance)}*`);

    // Show how-to-pay details so the customer can act on it immediately
    const modes = { ...DEFAULT_PAYMENT_MODES, ...(paymentModes || {}) };
    lines.push('');
    lines.push('*HOW TO PAY*');
    if (modes.centenary_account) lines.push(`Bank (Centenary): ${modes.centenary_account}`);
    if (modes.mtn_code)         lines.push(`MTN Mobile Money: ${modes.mtn_code}`);
    if (modes.airtel_merchant)  lines.push(`Airtel Money: ${modes.airtel_merchant}`);
    lines.push('Kindly clear the balance before collection.');
  } else {
    lines.push('Payment: *Fully Settled* ✓');
  }

  return lines;
}

/**
 * Single source of truth for every customer-facing order message on WhatsApp.
 *
 * Message style by kind:
 *  confirmation / receipt — full item list + detailed payment breakdown
 *  ready / delivered      — concise (NO item list), just totals + payment modes if owing
 */
export function buildOrderWhatsAppMessage(
  order: OrderWhatsAppPayload,
  items: OrderWhatsAppItem[],
  options: {
    kind?: OrderMessageKind;
    business?: BusinessInfo | null;
    paymentModes?: PaymentModeDetails | null;
  } = {}
): string {
  const kind = resolveKind(order, options.kind || 'receipt');
  const business = { ...DEFAULT_BUSINESS_INFO, ...(options.business || {}) };
  const branchName = order.branch_name || business.branch_name;
  const paid = isFullyPaid(order);

  // Whether to include the per-item breakdown (only for confirmation / receipt)
  const showItemDetail = kind === 'confirmation' || kind === 'receipt';

  const lines: string[] = [
    `Hello *${order.customer_name}*!`,
    '',
    `*${(business.name || DEFAULT_BUSINESS_INFO.name || '').toUpperCase()}*`,
    headerFor(kind),
    '',
    `Order #: *${order.order_number}*`,
    `Date: ${formatShortDate(order.created_at)}`,
  ];

  const statusLabel = orderStatusLabel(order);
  if (statusLabel) lines.push(`Status: ${statusLabel}`);
  if (branchName) lines.push(`Branch: ${branchName}`);
  lines.push('');

  if (showItemDetail) {
    // Full receipt — item list then detailed payment breakdown
    lines.push(...buildItemLines(items));
    lines.push(...buildPaymentSummaryLines(order, items));
    lines.push(...buildPaymentRequestLines(order, options.paymentModes));
  } else {
    // Compact notification — no item list, just money figures + payment modes
    lines.push(...buildCompactPaymentLines(order, options.paymentModes));
  }

  lines.push('');

  switch (kind) {
    case 'confirmation':
      lines.push('We have received your items and our team is now working on them.');
      lines.push('We will notify you as soon as your order is ready for collection.');
      lines.push('');
      lines.push('Please contact us if you have any questions.');
      break;

    case 'ready':
      lines.push('Great news — your order is ready for collection!');
      lines.push('Please check all items carefully when collecting.');
      lines.push(...buildCollectionPolicyLines());
      break;

    case 'delivered':
      lines.push('This order has been marked as delivered.');
      lines.push('We hope everything met your expectations.');
      break;

    default: // receipt / processing
      lines.push("We'll notify you as soon as your order is ready for pickup.");
      break;
  }

  lines.push('');
  if (paid) {
    lines.push('Thank you for your payment!');
  } else {
    lines.push('Kindly settle the outstanding balance at your earliest convenience.');
  }
  lines.push('Thank you for choosing Lush!');

  lines.push(...buildBusinessFooterLines({ ...business, branch_name: branchName }));

  return lines.join('\n');
}

/** Order confirmation for WhatsApp Messenger (sent right after creating an order) */
export function buildOrderConfirmationWhatsAppMessage(
  order: OrderWhatsAppPayload,
  items: OrderWhatsAppItem[],
  business?: BusinessInfo | string | null,
  paymentModes?: PaymentModeDetails | null
): string {
  return buildOrderWhatsAppMessage(order, items, {
    kind: 'confirmation',
    business: typeof business === 'string' ? { phone: business } : business,
    paymentModes,
  });
}

/** Receipt / follow-up message. Content follows the order's real status. */
export function buildOrderReceiptWhatsAppMessage(
  order: OrderWhatsAppPayload,
  items: OrderWhatsAppItem[],
  business?: BusinessInfo | string | null,
  paymentModes?: PaymentModeDetails | null
): string {
  return buildOrderWhatsAppMessage(order, items, {
    kind: 'receipt',
    business: typeof business === 'string' ? { phone: business } : business,
    paymentModes,
  });
}

/** "Your order is ready" notification. Falls back to a receipt if not ready yet. */
export function buildOrderReadyWhatsAppMessage(
  order: OrderWhatsAppPayload,
  items: OrderWhatsAppItem[],
  business?: BusinessInfo | null,
  paymentModes?: PaymentModeDetails | null
): string {
  return buildOrderWhatsAppMessage(order, items, { kind: 'ready', business, paymentModes });
}

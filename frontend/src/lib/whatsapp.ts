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
  tax_rate?: number;
  tax_amount?: number;
  total_amount: number;
  amount_paid: number;
  balance: number;
  payment_status?: string;
  payment_method?: string;
};

export type OrderWhatsAppItem = {
  item_name: string;
  service_type: string;
  quantity: number;
  total_price: number;
};

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

/** Order confirmation for WhatsApp Messenger (sent right after creating an order) */
export function buildOrderConfirmationWhatsAppMessage(
  order: OrderWhatsAppPayload,
  items: OrderWhatsAppItem[],
  businessPhone?: string
): string {
  const lines: string[] = [
    `Hello *${order.customer_name}*! 👋`,
    '',
    `🧺 *LUSH DRY CLEANERS & LAUNDROMAT*`,
    `📋 *ORDER CONFIRMATION*`,
    '',
    `Order #: *${order.order_number}*`,
    `Date: ${formatShortDate(order.created_at)}`,
    '',
    `*ITEMS:*`,
  ];

  items.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.item_name} (${item.service_type}) × ${item.quantity} — ${formatUGX(item.total_price)}`
    );
  });

  lines.push('', `*PAYMENT SUMMARY*`);
  lines.push(`Subtotal: ${formatUGX(order.subtotal)}`);

  if ((order.discount_percentage || 0) > 0) {
    lines.push(`Discount (${order.discount_percentage}%): -${formatUGX(order.discount_amount || 0)}`);
  }
  if ((order.bargain_amount || 0) > 0) {
    lines.push(`Bargain: -${formatUGX(order.bargain_amount || 0)}`);
  }
  if ((order.tax_amount || 0) > 0) {
    lines.push(`VAT (${order.tax_rate || 18}%): +${formatUGX(order.tax_amount || 0)}`);
  }

  lines.push(`*TOTAL: ${formatUGX(order.total_amount)}*`);
  lines.push(`Amount Paid: ${formatUGX(order.amount_paid)}`);

  if (order.balance > 0) {
    lines.push(`*Balance Due: ${formatUGX(order.balance)}*`);
  } else {
    lines.push(`Status: ✅ Fully Paid`);
  }

  if (order.payment_method) {
    const method = order.payment_method === 'ON_ACCOUNT'
      ? 'On Account'
      : order.payment_method.replace(/_/g, ' ');
    lines.push(`Method: ${method}`);
  }

  lines.push(
    '',
    `We'll notify you when your laundry is ready for pickup.`,
    `Please check all items carefully when collecting.`,
    '',
    `Thank you for choosing Lush! ✨`
  );

  if (businessPhone) {
    lines.push(`📞 ${businessPhone}`);
  }

  return lines.join('\n');
}

/** Receipt / follow-up message (does NOT claim order is ready unless status is ready) */
export function buildOrderReceiptWhatsAppMessage(
  order: OrderWhatsAppPayload & { order_status?: string },
  items: OrderWhatsAppItem[],
  businessPhone?: string
): string {
  const isReady = (order.order_status || '').toLowerCase() === 'ready';
  const header = isReady
    ? `✅ *Your order is READY for pickup!*`
    : `📋 *Order receipt / update*`;

  const base = buildOrderConfirmationWhatsAppMessage(order, items, businessPhone);
  // Replace confirmation header block with receipt-oriented header for follow-ups
  return base
    .replace('📋 *ORDER CONFIRMATION*', header)
    .replace(
      `We'll notify you when your laundry is ready for pickup.`,
      isReady
        ? `Please collect at your earliest convenience.`
        : `We'll notify you when your laundry is ready for pickup.`
    );
}

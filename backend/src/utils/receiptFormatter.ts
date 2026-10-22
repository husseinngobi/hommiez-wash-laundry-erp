export type ReceiptOrderStatus = 'pending' | 'processing' | 'ready' | 'delivered' | 'cancelled';
export type ReceiptPaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  totalPrice: number;
}

export interface ReceiptTotals {
  subtotal: number;
  orderDiscountAmount: number;
  bargainAmount: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balance: number;
}

export interface ReceiptContext extends ReceiptTotals {
  customerName: string;
  orderNumber: string;
  orderStatus: ReceiptOrderStatus;
  paymentStatus: ReceiptPaymentStatus;
  paymentMethods?: string[];
}

const businessProfile = {
  name: process.env.BUSINESS_NAME || 'Hommiez Wash Laundry and Dry Cleaners',
  phone: process.env.BUSINESS_PHONE || '',
  email: process.env.BUSINESS_EMAIL || '',
  location: process.env.BUSINESS_LOCATION || '',
  address: process.env.BUSINESS_ADDRESS || '',
  hours: process.env.BUSINESS_HOURS || 'Mon-Sat: 7:00 AM - 9:00 PM',
};

const moneyFormatter = new Intl.NumberFormat('en-UG', {
  maximumFractionDigits: 0,
});

export const formatMoney = (amount: number): string => moneyFormatter.format(Math.round(Number(amount) || 0));

export const calculateDiscountPercentage = (baseAmount: number, discountAmount: number): number => {
  if (baseAmount <= 0 || discountAmount <= 0) {
    return 0;
  }

  return Math.round((discountAmount / baseAmount) * 100);
};

export const formatReceiptItemText = (item: ReceiptItem): string => {
  const originalLineTotal = Math.max(0, Math.round(item.unitPrice * item.quantity));
  const lineDiscount = Math.max(0, Math.round(item.discountAmount || 0));
  const lineTotal = Math.max(0, Math.round(item.totalPrice || (originalLineTotal - lineDiscount)));
  const discountPercentage = calculateDiscountPercentage(originalLineTotal, lineDiscount);

  const quantityLabel = `${item.quantity} x ${formatMoney(item.unitPrice)}`;
  const discountLabel = lineDiscount > 0
    ? ` | Discount ${discountPercentage}% (-${formatMoney(lineDiscount)})`
    : '';

  return `${item.name}\n• ${quantityLabel} | Net ${formatMoney(lineTotal)}${discountLabel}`;
};

export const buildReceiptSummaryLines = (totals: ReceiptTotals): string[] => {
  const lines: string[] = [];

  lines.push(`SUBTOTAL                 ${formatMoney(totals.subtotal)}`);

  if (totals.orderDiscountAmount > 0) {
    const percentage = calculateDiscountPercentage(totals.subtotal, totals.orderDiscountAmount);
    lines.push(`ORDER DISCOUNT (${percentage}%)   -${formatMoney(totals.orderDiscountAmount)}`);
  }

  if (totals.bargainAmount > 0) {
    const discountPercentage = calculateDiscountPercentage(totals.subtotal, totals.bargainAmount);
    lines.push(`BARGAIN DISCOUNT (${discountPercentage}%) -${formatMoney(totals.bargainAmount)}`);
  }

  if (totals.taxAmount > 0) {
    lines.push(`TAX                       +${formatMoney(totals.taxAmount)}`);
  }

  lines.push(`TOTAL                    ${formatMoney(totals.total)}`);
  lines.push(`PAID                     ${formatMoney(totals.amountPaid)}`);
  lines.push(`BALANCE DUE              ${formatMoney(totals.balance)}`);

  return lines;
};

export const buildBusinessInfoLines = (): string[] => {
  const lines = [
    `BUSINESS                 ${businessProfile.name}`,
    `CONTACT                  ${businessProfile.phone}`,
  ];

  if (businessProfile.email) {
    lines.push(`EMAIL                    ${businessProfile.email}`);
  }

  if (businessProfile.location) {
    lines.push(`LOCATION                 ${businessProfile.location}`);
  }

  if (businessProfile.address) {
    lines.push(`ADDRESS                  ${businessProfile.address}`);
  }

  if (businessProfile.hours) {
    lines.push(`HOURS                    ${businessProfile.hours}`);
  }

  return lines;
};

export const buildPaymentMethodsLine = (paymentMethods?: string[]): string => {
  const methods = paymentMethods?.length
    ? paymentMethods.join(', ')
    : 'cash, MTN Mobile Money, Airtel Money, or bank transfer';

  return `Payment methods: ${methods}`;
};

export const buildStoragePolicyLine = (): string => {
  return 'Storage policy: Items not collected within 3 days after readiness may attract extra storage charges. Unclaimed items after 3 months may be donated.';
};

export const buildReceiptClosingMessage = (context: ReceiptContext): string => {
  const paymentMethods = buildPaymentMethodsLine(context.paymentMethods);
  const businessDetails = buildBusinessInfoLines().join('\n');
  const storagePolicy = buildStoragePolicyLine();

  if (context.orderStatus === 'ready') {
    if (context.paymentStatus === 'PAID') {
      return `\nYour order is ready for pickup and your payment is already complete. Please visit us at your convenience.\n\n${paymentMethods}\n${storagePolicy}\n${businessDetails}\n\nThank you for choosing Hommiez Wash Laundry and Dry Cleaners. We appreciate your continued support.`;
    }

    return `\nYour order is ready for pickup. Outstanding balance: UGX ${formatMoney(context.balance)}.\n\n${paymentMethods}\n${storagePolicy}\n${businessDetails}\n\nThank you for choosing Hommiez Wash Laundry and Dry Cleaners.`;
  }

  if (context.orderStatus === 'delivered') {
    if (context.paymentStatus === 'PAID') {
      return `\nYour order has been marked as delivered and your payment is complete. Thank you for your payment and for choosing Hommiez Wash Laundry and Dry Cleaners.\n\n${paymentMethods}\n${storagePolicy}\n${businessDetails}\n\nWe appreciate your business and look forward to serving you again.`;
    }

    return `\nYour order has been marked as delivered. Outstanding balance: UGX ${formatMoney(context.balance)}.\n\n${paymentMethods}\n${storagePolicy}\n${businessDetails}\n\nThank you for choosing Hommiez Wash Laundry and Dry Cleaners.`;
  }

  if (context.paymentStatus === 'PAID') {
    return `\nYour order has been received and payment has been completed.\n\n${paymentMethods}\n${storagePolicy}\n${businessDetails}\n\nThank you for choosing Hommiez Wash Laundry and Dry Cleaners.`;
  }

  return `\nYour order has been received and is being processed. Outstanding balance: UGX ${formatMoney(context.balance)}.\n\n${paymentMethods}\n${storagePolicy}\n${businessDetails}\n\nThank you for choosing Hommiez Wash Laundry and Dry Cleaners.`;
};
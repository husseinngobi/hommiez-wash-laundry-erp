import AfricasTalking from 'africastalking';
import {
  buildBusinessInfoLines,
  buildReceiptClosingMessage,
  buildReceiptSummaryLines,
  buildPaymentMethodsLine,
  buildStoragePolicyLine,
  formatReceiptItemText,
  ReceiptItem,
  ReceiptOrderStatus,
  ReceiptPaymentStatus,
} from '../utils/receiptFormatter';

// Initialize Africa's Talking SDK
const africastalking = AfricasTalking({
  apiKey: process.env.AFRICASTALKING_API_KEY || '',
  username: process.env.AFRICASTALKING_USERNAME || '',
});

const sms = africastalking.SMS;

interface SendSMSParams {
  to: string; // Phone number in international format (e.g., +256700123456)
  message: string;
}

interface WhatsAppAPIResponse {
  messageId?: string;
  phoneNumber?: string;
  status: string;
}

/**
 * Send SMS using Africa's Talking
 */
export const sendSMS = async ({ to, message }: SendSMSParams): Promise<boolean> => {
  try {
    // Check if SMS is enabled
    if (process.env.SMS_ENABLED !== 'true') {
      console.log('📵 SMS disabled in environment. Would have sent:', { to, message });
      return false;
    }

    // Validate API credentials
    if (!process.env.AFRICASTALKING_API_KEY || !process.env.AFRICASTALKING_USERNAME) {
      console.error('❌ Africa\'s Talking credentials not configured');
      return false;
    }

    // Send SMS
    const smsOptions: any = {
      to: [to],
      message,
    };
    
    // Add sender ID only if configured
    if (process.env.SMS_SENDER_ID) {
      smsOptions.from = process.env.SMS_SENDER_ID;
    }
    
    const result = await sms.send(smsOptions);

    console.log('✅ SMS sent successfully:', result);
    return true;
  } catch (error) {
    console.error('❌ Failed to send SMS:', error);
    return false;
  }
};

/**
 * Send order ready notification to customer
 */
export const sendOrderStatusNotification = async (
  customerPhone: string,
  orderNumber: string,
  customerName: string,
  orderStatus: ReceiptOrderStatus,
  paymentStatus: ReceiptPaymentStatus,
  balance: number,
  paymentMethods?: string[]
): Promise<boolean> => {
  const statusLead = orderStatus === 'delivered'
    ? `Your laundry order ${orderNumber} has been marked as delivered.`
    : `Your laundry order ${orderNumber} is ready for pickup.`;

  const paymentNote = paymentStatus === 'PAID'
    ? orderStatus === 'delivered'
      ? 'Your payment is complete.'
      : 'Your payment has already been received.'
    : `Outstanding balance: UGX ${balance.toLocaleString()}.`;

  const paymentPrompt = paymentStatus === 'PAID'
    ? ''
    : `\n${buildPaymentMethodsLine(paymentMethods)}`;

  const businessInfo = buildBusinessInfoLines().join('\n');
  const storagePolicy = buildStoragePolicyLine();

  const closing = orderStatus === 'delivered' && paymentStatus === 'PAID'
    ? `\n\nThank you for choosing Hommiez Wash Laundry and Dry Cleaners. We appreciate your business and look forward to serving you again.`
    : `\n\nThank you for choosing Hommiez Wash Laundry and Dry Cleaners.`;

  const message = `Hello ${customerName}!

${statusLead}
${paymentNote}${paymentPrompt}

${storagePolicy}
${businessInfo}${closing}`;

  return sendSMS({ to: customerPhone, message });
};

export const sendOrderReadyNotification = async (
  customerPhone: string,
  orderNumber: string,
  customerName: string,
  paymentStatus: ReceiptPaymentStatus = 'UNPAID',
  balance = 0,
  paymentMethods?: string[]
): Promise<boolean> => {
  return sendOrderStatusNotification(
    customerPhone,
    orderNumber,
    customerName,
    'ready',
    paymentStatus,
    balance,
    paymentMethods
  );
};

export const sendOrderDeliveredNotification = async (
  customerPhone: string,
  orderNumber: string,
  customerName: string,
  paymentStatus: ReceiptPaymentStatus,
  balance: number,
  paymentMethods?: string[]
): Promise<boolean> => {
  return sendOrderStatusNotification(
    customerPhone,
    orderNumber,
    customerName,
    'delivered',
    paymentStatus,
    balance,
    paymentMethods
  );
};

/**
 * Send order receipt/confirmation when order is created
 */
export const sendOrderReceipt = async (
  customerPhone: string,
  orderNumber: string,
  customerName: string,
  orderDetails: {
    items: ReceiptItem[];
    subtotal: number;
    orderDiscountAmount: number;
    bargainAmount: number;
    taxAmount: number;
    total: number;
    amountPaid: number;
    balance: number;
    paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
    orderStatus?: ReceiptOrderStatus;
  }
): Promise<boolean> => {
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  });
  
  // Calculate pickup date (3 days from now)
  const pickupDate = new Date(today);
  pickupDate.setDate(pickupDate.getDate() + 3);
  const formattedPickupDate = pickupDate.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  });

  // Build items list with professional formatting
  const itemsList = orderDetails.items
    .map((item) => formatReceiptItemText(item))
    .join('\n──────────────────────────────────\n');

  const businessInfo = buildBusinessInfoLines().join('\n');

  const summaryLines = buildReceiptSummaryLines({
    subtotal: orderDetails.subtotal,
    orderDiscountAmount: orderDetails.orderDiscountAmount,
    bargainAmount: orderDetails.bargainAmount,
    taxAmount: orderDetails.taxAmount,
    total: orderDetails.total,
    amountPaid: orderDetails.amountPaid,
    balance: orderDetails.balance,
  });

  const closing = buildReceiptClosingMessage({
    customerName,
    orderNumber,
    orderStatus: orderDetails.orderStatus || 'pending',
    paymentStatus: orderDetails.paymentStatus,
    subtotal: orderDetails.subtotal,
    orderDiscountAmount: orderDetails.orderDiscountAmount,
    bargainAmount: orderDetails.bargainAmount,
    taxAmount: orderDetails.taxAmount,
    total: orderDetails.total,
    amountPaid: orderDetails.amountPaid,
    balance: orderDetails.balance,
  });

  const message = `══════════════════════════════════
        HOMMIEZ WASH LAUNDRY AND DRY CLEANERS
          & LAUNDROMAT
══════════════════════════════════
ORDER RECEIPT

Order No : ${orderNumber}
Date     : ${formattedDate}
Customer : ${customerName}
${businessInfo}
──────────────────────────────────

ITEMS
──────────────────────────────────
Item                Qty   Amount
──────────────────────────────────
${itemsList}
──────────────────────────────────

${summaryLines.join('\n')}
──────────────────────────────────

Pickup Date : ${formattedPickupDate}
══════════════════════════════════

${closing}
For inquiries, please call us.`;

  return sendSMS({ to: customerPhone, message });
};

/**
 * Send payment reminder notification
 */
export const sendPaymentReminder = async (
  customerPhone: string,
  orderNumber: string,
  customerName: string,
  balance: number
): Promise<boolean> => {
  const message = `Hello ${customerName},

Reminder: Your order ${orderNumber} has an outstanding balance of UGX ${balance.toLocaleString()}.

Please settle payment when you collect your items.

Thank you! 🙏`;

  return sendSMS({ to: customerPhone, message });
};

/**
 * Send birthday/anniversary greeting
 */
export const sendSpecialDayGreeting = async (
  customerPhone: string,
  customerName: string,
  occasionType: 'birthday' | 'anniversary',
  discount?: number
): Promise<boolean> => {
  const occasion = occasionType === 'birthday' ? 'Birthday' : 'Anniversary';
  const emoji = occasionType === 'birthday' ? '🎂' : '💑';
  
  let message = `Happy ${occasion} ${customerName}! ${emoji}

Wishing you a wonderful day filled with joy and happiness!`;

  if (discount) {
    message += `\n\n🎁 Special gift: ${discount}% OFF your next order!

Visit us today and enjoy your special discount.`;
  }

  message += `\n\nWith love,\nHommiez Wash Laundry and Dry Cleaners Team ❤️`;

  return sendSMS({ to: customerPhone, message });
};

/**
 * Send bulk promotional SMS to multiple customers
 */
export const sendBulkPromo = async (
  recipients: Array<{ phone: string; name: string }>,
  promoMessage: string
): Promise<{ sent: number; failed: number }> => {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const personalizedMessage = promoMessage.replace('{name}', recipient.name);
    const success = await sendSMS({ to: recipient.phone, message: personalizedMessage });
    
    if (success) {
      sent++;
    } else {
      failed++;
    }

    // Add small delay to avoid rate limiting (100ms between messages)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`📊 Bulk SMS Results: ${sent} sent, ${failed} failed`);
  return { sent, failed };
};

/**
 * Smart messaging: Try WhatsApp first, fallback to SMS if WhatsApp unavailable
 * This ensures message delivery even if customer doesn't have WhatsApp
 */
export const sendSmartMessage = async (
  to: string,
  message: string
): Promise<{ sent: boolean; method: 'whatsapp' | 'sms' | 'failed' }> => {
  // If WhatsApp is configured, try it first
  if (process.env.AFRICASTALKING_WA_NUMBER) {
    try {
      const whatsappSent = await sendWhatsAppText(to, message);
      if (whatsappSent) {
        return { sent: true, method: 'whatsapp' };
      }
    } catch (error) {
      console.log('📱 WhatsApp failed, falling back to SMS...', error);
    }
  }

  // Fallback to SMS
  const smsSent = await sendSMS({ to, message });
  return { 
    sent: smsSent, 
    method: smsSent ? 'sms' : 'failed' 
  };
};

/**
 * Send WhatsApp message with PDF attachment using Africa's Talking WhatsApp API
 * Note: This uses the dedicated WhatsApp endpoint, NOT the SMS endpoint
 */
export const sendWhatsAppPDF = async (
  to: string,
  message: string,
  pdfUrl: string
): Promise<boolean> => {
  try {
    // Check if SMS/WhatsApp is enabled
    if (process.env.SMS_ENABLED !== 'true') {
      console.log('📵 WhatsApp disabled. Would have sent PDF to:', to);
      return false;
    }

    // Validate credentials
    if (!process.env.AFRICASTALKING_API_KEY || !process.env.AFRICASTALKING_USERNAME) {
      console.error('❌ Africa\'s Talking credentials not configured');
      return false;
    }

    // Validate WhatsApp number is configured
    if (!process.env.AFRICASTALKING_WA_NUMBER) {
      console.error('❌ Africa\'s Talking WhatsApp number not configured');
      return false;
    }

    // Use WhatsApp API endpoint (not SMS)
    const whatsappEndpoint = process.env.NODE_ENV === 'production'
      ? 'https://chat.africastalking.com/whatsapp/message/send'
      : 'https://chat.sandbox.africastalking.com/whatsapp/message/send';

    // Send WhatsApp message with PDF using fetch
    const response = await fetch(whatsappEndpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'apiKey': process.env.AFRICASTALKING_API_KEY || '',
      },
      body: JSON.stringify({
        username: process.env.AFRICASTALKING_USERNAME,
        waNumber: process.env.AFRICASTALKING_WA_NUMBER, // Your WhatsApp Business number
        phoneNumber: to,
        body: {
          mediaType: 'Document', // For PDF
          url: pdfUrl, // PDF must be publicly accessible
          caption: message,
        },
      }),
    });

    const result = await response.json() as WhatsAppAPIResponse;

    if (response.ok && result.status === 'SENT') {
      console.log('✅ WhatsApp PDF sent:', result);
      return true;
    } else {
      console.error('❌ WhatsApp API error:', result);
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to send WhatsApp PDF:', error);
    return false;
  }
};

/**
 * Send WhatsApp text message using Africa's Talking WhatsApp API
 */
export const sendWhatsAppText = async (
  to: string,
  message: string
): Promise<boolean> => {
  try {
    if (process.env.SMS_ENABLED !== 'true') {
      console.log('📵 WhatsApp disabled. Would have sent to:', to);
      return false;
    }

    if (!process.env.AFRICASTALKING_API_KEY || !process.env.AFRICASTALKING_USERNAME) {
      console.error('❌ Africa\'s Talking credentials not configured');
      return false;
    }

    if (!process.env.AFRICASTALKING_WA_NUMBER) {
      console.error('❌ Africa\'s Talking WhatsApp number not configured');
      return false;
    }

    const whatsappEndpoint = process.env.NODE_ENV === 'production'
      ? 'https://chat.africastalking.com/whatsapp/message/send'
      : 'https://chat.sandbox.africastalking.com/whatsapp/message/send';

    const response = await fetch(whatsappEndpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'apiKey': process.env.AFRICASTALKING_API_KEY || '',
      },
      body: JSON.stringify({
        username: process.env.AFRICASTALKING_USERNAME,
        waNumber: process.env.AFRICASTALKING_WA_NUMBER,
        phoneNumber: to,
        body: {
          message: message,
        },
      }),
    });

    const result = await response.json() as WhatsAppAPIResponse;

    if (response.ok && result.status === 'SENT') {
      console.log('✅ WhatsApp text sent:', result);
      return true;
    } else {
      console.error('❌ WhatsApp API error:', result);
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to send WhatsApp text:', error);
    return false;
  }
};

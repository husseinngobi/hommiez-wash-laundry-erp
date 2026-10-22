/**
 * Payment Channel Types - Based on MTN MoMo and Airtel Money API Standards
 * 
 * This distinguishes between different mobile money transaction types
 * for proper ERP reconciliation and compliance.
 */

export enum PaymentMethod {
  CASH = 'CASH',
  MOBILE_MONEY_MTN = 'MOBILE_MONEY_MTN',
  MOBILE_MONEY_AIRTEL = 'MOBILE_MONEY_AIRTEL',
  BANK_TRANSFER = 'BANK_TRANSFER'
}

/**
 * Payment Channel Classification
 * 
 * P2P: Direct phone-to-phone transfers (Wallet-to-Wallet)
 * - Customer sends money directly to business phone number
 * - No structured reference, harder to reconcile
 * - Use case: Informal deposits, fallback payments
 * 
 * MERCHANT: Merchant code payments via USSD (*165# MTN, *185# Airtel)
 * - Customer pays through merchant shortcode
 * - Has structured reference and callbacks
 * - Recommended for ERP integration
 * 
 * API_PUSH: API-initiated STK push payments
 * - System triggers payment prompt on customer's phone
 * - Full webhook integration
 * - Best for automated systems
 * 
 * MANUAL: Manually recorded payment
 * - Staff entered payment details
 * - May be from any source
 * 
 * DEPOSIT: Cash deposit at mobile money agent
 * - Customer deposited cash at agent to business account
 * - Has agent reference
 */
export enum PaymentChannel {
  P2P = 'P2P',                    // Peer-to-Peer / Wallet transfer
  MERCHANT = 'MERCHANT',          // Merchant code payment (*165#/*185#)
  API_PUSH = 'API_PUSH',          // STK Push / API-initiated
  MANUAL = 'MANUAL',              // Manually recorded
  DEPOSIT = 'DEPOSIT'             // Cash deposit at agent
}

export interface PaymentRecord {
  id: number;
  order_id: number;
  customer_id: number;
  amount: number;
  payment_method: PaymentMethod;
  payment_channel: PaymentChannel;
  transaction_reference?: string;
  merchant_id?: string;             // Merchant shortcode for MERCHANT channel
  sender_phone?: string;            // Format: 256772123456
  recipient_account?: string;       // Format: 0772123456
  account_name?: string;            // E.g., "Hommiez Wash Laundry and Dry Cleaners MTN Main"
  payment_date: Date;
  notes?: string;
  created_by?: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePaymentDTO {
  order_id: number;
  customer_id: number;
  amount: number;
  payment_method: PaymentMethod;
  payment_channel: PaymentChannel;
  transaction_reference?: string;
  merchant_id?: string;
  sender_phone?: string;
  recipient_account?: string;
  account_name?: string;
  notes?: string;
}

/**
 * Business Mobile Money Accounts Configuration
 * Register your business accounts here for dropdown selection
 */
export interface MoMoAccount {
  phone_number: string;           // Format: 0772123456
  operator: 'MTN' | 'AIRTEL';
  account_name: string;           // E.g., "Main Business Account"
  merchant_code?: string;         // USSD shortcode if applicable
  is_active: boolean;
  is_primary: boolean;            // Default account for this operator
}

/**
 * Payment Channel Metadata for UI Display
 */
export const PaymentChannelInfo = {
  [PaymentChannel.P2P]: {
    label: 'Phone Transfer (P2P)',
    description: 'Direct phone number transfer',
    icon: '📱',
    reconciliation: 'Manual',
    recommended: false
  },
  [PaymentChannel.MERCHANT]: {
    label: 'Merchant Code (*165#/*185#)',
    description: 'Payment via USSD merchant code',
    icon: '🏪',
    reconciliation: 'Automatic',
    recommended: true
  },
  [PaymentChannel.API_PUSH]: {
    label: 'STK Push (API)',
    description: 'System-initiated payment prompt',
    icon: '🔔',
    reconciliation: 'Automatic',
    recommended: true
  },
  [PaymentChannel.MANUAL]: {
    label: 'Manual Entry',
    description: 'Manually recorded payment',
    icon: '✍️',
    reconciliation: 'Manual',
    recommended: false
  },
  [PaymentChannel.DEPOSIT]: {
    label: 'Agent Deposit',
    description: 'Cash deposit at MoMo agent',
    icon: '🏦',
    reconciliation: 'Manual',
    recommended: false
  }
};

/**
 * Validation helpers
 */
export const isPhoneNumberValid = (phone: string): boolean => {
  // Uganda format: 0772123456 or 256772123456
  return /^(0|256)[7][0-9]{8}$/.test(phone);
};

export const formatPhoneNumber = (phone: string, format: 'local' | 'international' = 'local'): string => {
  const cleaned = phone.replace(/\D/g, '');
  
  if (format === 'international') {
    // Convert to 256XXXXXXXXX
    if (cleaned.startsWith('0')) {
      return '256' + cleaned.slice(1);
    }
    return cleaned.startsWith('256') ? cleaned : '256' + cleaned;
  } else {
    // Convert to 07XXXXXXXX
    if (cleaned.startsWith('256')) {
      return '0' + cleaned.slice(3);
    }
    return cleaned.startsWith('0') ? cleaned : '0' + cleaned;
  }
};

/**
 * Get recommended channel for payment method
 */
export const getRecommendedChannel = (method: PaymentMethod): PaymentChannel => {
  switch (method) {
    case PaymentMethod.MOBILE_MONEY_MTN:
    case PaymentMethod.MOBILE_MONEY_AIRTEL:
      return PaymentChannel.MERCHANT; // Prefer merchant code for MoMo
    case PaymentMethod.CASH:
    case PaymentMethod.BANK_TRANSFER:
      return PaymentChannel.MANUAL;
    default:
      return PaymentChannel.MANUAL;
  }
};

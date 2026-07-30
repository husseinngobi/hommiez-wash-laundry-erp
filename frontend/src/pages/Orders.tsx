import { MainLayout } from '@/components/layout/MainLayout';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { RefundDialog } from '@/components/orders/RefundDialog';
import Invoice from '@/components/Invoice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Search, Eye, Calendar, User, Phone, Package, CreditCard, AlertCircle, CheckCircle2, Edit, ChevronLeft, ChevronRight, Truck, MapPin, MessageCircle, Printer, FileText, Settings2, Share2, Download, Mail, Trash2, ExternalLink, Bell, MessageSquare } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  openWhatsAppMessenger,
  buildOrderReceiptWhatsAppMessage,
  DEFAULT_PAYMENT_MODES,
  type PaymentModeDetails,
} from '@/lib/whatsapp';

interface Order {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  order_status: string;
  payment_status: string;
  payment_method: string;
  subtotal: number;
  discount_percentage: number;
  discount_amount: number;
  bargain_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance: number;
  due_date: string | null;
  pickup_date: string | null;
  notes: string;
  created_at: string;
  staff_name?: string;
  user_role?: string;
}

interface OrderItem {
  id: number;
  item_name: string;
  service_type: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface PaymentTransaction {
  id: number;
  order_id: number;
  amount: number;
  payment_method: string;
  transaction_reference?: string;
  payment_date: string;
  notes?: string;
  created_by?: number;
  created_at: string;
  received_by?: string;  // Staff member who received the payment
}

interface OrderDelivery {
  id: number;
  order_id: number;
  delivery_type: 'PAID' | 'FREE';
  delivery_status: string;
  delivery_revenue: number;
  scheduled_date: string;
  scheduled_time_slot?: string;
  delivery_address?: string;
  delivery_notes?: string;
  delivery_person_name?: string;
  vehicle_info?: string;
  zone_name?: string;
  zone_code?: string;
  driver_name?: string;
  driver_phone?: string;
  vehicle_type?: string;
  vehicle_number?: string;
  created_at: string;
  updated_at: string;
}

interface DeliveryZone {
  id: number;
  zone_name: string;
  zone_code: string;
  base_delivery_cost: number;
  estimated_delivery_time_minutes: number;
}


const formatNumberWithCommas = (value: string): string => {
  // Remove all non-digits
  const number = value.replace(/\D/g, '');
  // Add commas
  return number.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const parseFormattedNumber = (value: string): string => {
  // Remove commas to get plain number
  return value.replace(/,/g, '');
};

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return 'Not collected yet';
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getDaysOld = (createdAt: string): string => {
  const created = new Date(createdAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - created.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.floor(diffDays / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
};

const isOverdue = (order: Order): boolean => {
  const created = new Date(order.created_at);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  
  // Overdue if: more than 30 days old AND (unpaid/partial OR not delivered)
  if (diffDays > 30) {
    const paymentOverdue = order.payment_status === 'UNPAID' || order.payment_status === 'PARTIAL';
    const notDelivered = order.order_status !== 'delivered' && order.order_status !== 'picked_up';
    return paymentOverdue || notDelivered;
  }
  return false;
};

// WhatsApp helper functions
const generateOrderReceiptMessage = (
  order: Order,
  items: OrderItem[],
  paymentModes?: PaymentModeDetails | null
): string => {
  return buildOrderReceiptWhatsAppMessage(
    {
      order_number: order.order_number,
      customer_name: order.customer_name,
      created_at: order.created_at,
      subtotal: Number(order.subtotal),
      discount_percentage: Number(order.discount_percentage || 0),
      discount_amount: Number(order.discount_amount || 0),
      bargain_amount: Number(order.bargain_amount || 0),
      tax_rate: Number(order.tax_rate || 0),
      tax_amount: Number(order.tax_amount || 0),
      total_amount: Number(order.total_amount),
      amount_paid: Number(order.amount_paid),
      balance: Number(order.balance),
      payment_status: order.payment_status,
      payment_method: order.payment_method,
      order_status: order.order_status,
    },
    items.map((item) => ({
      item_name: item.item_name,
      service_type: item.service_type,
      quantity: item.quantity,
      total_price: Number(item.total_price),
    })),
    undefined,
    paymentModes || DEFAULT_PAYMENT_MODES
  );
};

const generateOrderReadyMessage = (order: Order): string => {
  let message = `╔═══════════════════════════════╗\n`;
  message += `║  ✅ ORDER READY FOR PICKUP   ║\n`;
  message += `╚═══════════════════════════════╝\n\n`;
  
  message += `Dear *${order.customer_name}*,\n\n`;
  message += `🎉 Great news! Your order is ready!\n\n`;
  
  message += `┌───────────────────────────────┐\n`;
  message += `│ PICKUP INFORMATION            │\n`;
  message += `├───────────────────────────────┤\n`;
  message += `│ Order #:  *${order.order_number}*${' '.repeat(Math.max(0, 19 - order.order_number.length))}│\n`;
  message += `│ Status:   ✅ READY           │\n`;
  message += `├───────────────────────────────┤\n`;
  message += `│ 📍 Location:                  │\n`;
  message += `│    Lush Dry Cleaners          │\n`;
  message += `│    & Laundromat               │\n`;
  message += `└───────────────────────────────┘\n\n`;
  
  message += `┌───────────────────────────────┐\n`;
  message += `│ PAYMENT DETAILS               │\n`;
  message += `├───────────────────────────────┤\n`;
  message += `│ Total Amount:                 │\n`;
  message += `│      ${formatUGX(order.total_amount).padStart(23)} │\n`;
  if (order.balance > 0) {
    message += `├───────────────────────────────┤\n`;
    message += `│ ⚠️  BALANCE DUE:              │\n`;
    message += `│      ${formatUGX(order.balance).padStart(23)} │\n`;
    message += `│                               │\n`;
    message += `│ Please bring payment when     │\n`;
    message += `│ collecting your order.        │\n`;
  } else {
    message += `├───────────────────────────────┤\n`;
    message += `│ ✅ Status: FULLY PAID         │\n`;
  }
  message += `└───────────────────────────────┘\n\n`;
  
  message += `═══════════════════════════════════════\n`;
  message += `Thank you for choosing Lush!\n`;
  message += `We look forward to serving you! 🌟\n`;
  message += `═══════════════════════════════════════`;
  
  return message;
};

// Generate context-aware reminder message for WhatsApp
const generateReminderMessage = (order: Order, businessPhone?: string): string => {
  const businessName = 'Lush Laundry';
  const phoneLine = businessPhone ? `\n📞 ${businessPhone}` : '';

  // READY for collection
  if (order.order_status === 'ready') {
    if (order.payment_status === 'PAID') {
      return `Hello ${order.customer_name}! 🎉\n\nYour order ${order.order_number} is READY for collection!\n\n📊 Total Amount: ${formatUGX(order.total_amount)}\n✅ Payment Status: Fully Paid\n\nPlease collect at your earliest convenience.\n\nThank you for choosing ${businessName}!${phoneLine}`;
    } else {
      return `Hello ${order.customer_name}! 👋\n\nYour order ${order.order_number} is READY for collection.\n\n📊 Total: ${formatUGX(order.total_amount)}\n💰 Balance Due: ${formatUGX(order.balance)}\n\nPlease collect and settle the balance.\n\n${businessName}${phoneLine}`;
    }
  }

  // DELIVERED but UNPAID/PARTIAL - Payment reminder
  if (order.order_status === 'delivered' && order.payment_status !== 'PAID') {
    const daysOverdue = order.due_date ? Math.floor((new Date().getTime() - new Date(order.due_date).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    return `Hello ${order.customer_name},\n\nReminder: Your order ${order.order_number} has an outstanding balance.\n\n💰 Amount Due: ${formatUGX(order.balance)}${daysOverdue > 0 ? `\n⚠️ Overdue by ${daysOverdue} days` : ''}\n\nKindly settle your balance at your earliest convenience.\n\nThank you,\n${businessName}${phoneLine}`;
  }

  // PROCESSING
  if (order.order_status === 'processing') {
    return `Hello ${order.customer_name}! 👋\n\nYour order ${order.order_number} is currently being processed.\n\nWe'll notify you once it's ready for collection.\n\nThank you for your patience!\n${businessName}${phoneLine}`;
  }

  // Generic reminder
  return `Hello ${order.customer_name}! 👋\n\nThis is a reminder about your order ${order.order_number}.\n\n📊 Total: ${formatUGX(order.total_amount)}\n💰 Balance: ${formatUGX(order.balance)}\n📍 Status: ${order.order_status}\n\nFor any questions, please contact us.${phoneLine}\n\n${businessName}`;
};

// Print receipt function
const printReceipt = (order: Order, items: OrderItem[]) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  
  const receiptHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Receipt - ${order.order_number}</title>
      <style>
        @media print {
          @page { size: 80mm 297mm; margin: 0; }
          body { margin: 0; padding: 0; }
        }
        body {
          font-family: 'Courier New', monospace;
          width: 80mm;
          margin: 0 auto;
          padding: 10mm;
          font-size: 12px;
          background: white;
          color: black;
        }
        .receipt-header {
          text-align: center;
          border-bottom: 2px dashed #000;
          padding-bottom: 10px;
          margin-bottom: 10px;
        }
        .receipt-header h1 {
          margin: 0;
          font-size: 18px;
          font-weight: bold;
        }
        .receipt-header p {
          margin: 2px 0;
          font-size: 11px;
        }
        .section {
          margin: 10px 0;
          border-bottom: 1px dashed #000;
          padding-bottom: 8px;
        }
        .section-title {
          font-weight: bold;
          margin-bottom: 5px;
          text-transform: uppercase;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 3px 0;
        }
        .items-table {
          width: 100%;
          margin: 10px 0;
        }
        .item-row {
          margin: 8px 0;
          border-bottom: 1px dotted #ccc;
          padding-bottom: 5px;
        }
        .item-name {
          font-weight: bold;
        }
        .item-details {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          margin-top: 2px;
        }
        .totals {
          margin-top: 10px;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          margin: 3px 0;
        }
        .total-row.grand {
          font-weight: bold;
          font-size: 14px;
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
          padding: 5px 0;
          margin: 8px 0;
        }
        .balance-due {
          background: #000;
          color: #fff;
          padding: 8px;
          text-align: center;
          font-weight: bold;
          margin: 10px 0;
        }
        .footer {
          text-align: center;
          margin-top: 15px;
          font-size: 11px;
          border-top: 2px dashed #000;
          padding-top: 10px;
        }
        .barcode {
          text-align: center;
          font-size: 24px;
          letter-spacing: 2px;
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <div class="receipt-header">
        <h1>🧺 LUSH DRY CLEANERS</h1>
        <p>& LAUNDROMAT</p>
        <p>Contact: [Your Phone Number]</p>
        <p>Email: [Your Email]</p>
      </div>
      
      <div class="section">
        <div class="section-title">Order Details</div>
        <div class="info-row">
          <span>Order #:</span>
          <strong>${order.order_number}</strong>
        </div>
        <div class="info-row">
          <span>Date:</span>
          <span>${formatDate(order.created_at)}</span>
        </div>
        <div class="info-row">
          <span>Customer:</span>
          <span>${order.customer_name}</span>
        </div>
        <div class="info-row">
          <span>Phone:</span>
          <span>${order.customer_phone}</span>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">Items</div>
        <div class="items-table">
          ${items.map((item, index) => `
            <div class="item-row">
              <div class="item-name">${index + 1}. ${item.item_name}</div>
              <div class="item-details">
                <span>${item.service_type} × ${item.quantity}</span>
                <strong>${formatUGX(item.total_price)}</strong>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="totals">
        <div class="total-row">
          <span>Subtotal:</span>
          <span>${formatUGX(order.subtotal)}</span>
        </div>
        ${order.discount_percentage > 0 ? `
          <div class="total-row">
            <span>Discount (${order.discount_percentage}%):</span>
            <span>-${formatUGX(order.discount_amount)}</span>
          </div>
        ` : ''}
        ${order.bargain_amount > 0 ? `
          <div class="total-row">
            <span>Bargain Deduction:</span>
            <span>-${formatUGX(order.bargain_amount)}</span>
          </div>
        ` : ''}
        ${order.tax_amount > 0 ? `
          <div class="total-row">
            <span>VAT (${order.tax_rate}%):</span>
            <span>+${formatUGX(order.tax_amount)}</span>
          </div>
        ` : ''}
        <div class="total-row grand">
          <span>TOTAL:</span>
          <span>${formatUGX(order.total_amount)}</span>
        </div>
        <div class="total-row">
          <span>Amount Paid:</span>
          <span>${formatUGX(order.amount_paid)}</span>
        </div>
        ${order.balance > 0 ? `
          <div class="total-row">
            <span>Balance:</span>
            <strong>${formatUGX(order.balance)}</strong>
          </div>
          <div class="balance-due">⚠️ BALANCE DUE: ${formatUGX(order.balance)}</div>
        ` : `
          <div style="text-align: center; padding: 8px; background: #e8f5e9; margin: 10px 0;">
            ✅ FULLY PAID
          </div>
        `}
      </div>
      
      <div class="section">
        <div class="info-row">
          <span>Pickup Date:</span>
          <strong>${formatDate(order.pickup_date)}</strong>
        </div>
        <div class="info-row">
          <span>Status:</span>
          <strong>${order.order_status}</strong>
        </div>
      </div>
      
      <div class="barcode">
        ${order.order_number}
      </div>
      
      <div class="footer">
        <p>Thank you for choosing Lush!</p>
        <p>🌟 We value your business! 🌟</p>
        <p>Please keep this receipt for collection</p>
      </div>
      
      <script>
        window.onload = () => {
          window.print();
          // Uncomment to auto-close after printing:
          // window.onafterprint = () => window.close();
        };
      </script>
    </body>
    </html>
  `;
  
  printWindow.document.write(receiptHTML);
  printWindow.document.close();
};

export default function Orders() {
  const { token, canCancelOrders, user, isAdmin } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>([]);
  const [orderDelivery, setOrderDelivery] = useState<OrderDelivery | null>(null);
  const [paymentTransactionsPage, setPaymentTransactionsPage] = useState(1);
  const [paymentTransactionsPerPage] = useState(10);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [invoiceOrderId, setInvoiceOrderId] = useState<number | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [cancelPaymentTarget, setCancelPaymentTarget] = useState<PaymentTransaction | null>(null);
  const [cancelPaymentReason, setCancelPaymentReason] = useState('');
  const [cancellingPayment, setCancellingPayment] = useState(false);
  const [paymentModes, setPaymentModes] = useState<PaymentModeDetails>(DEFAULT_PAYMENT_MODES);
  const [additionalPayment, setAdditionalPayment] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER'>('CASH');
  const [mobileMoneyProvider, setMobileMoneyProvider] = useState<'MTN' | 'AIRTEL'>('MTN');
  const [paymentChannel, setPaymentChannel] = useState<'MANUAL' | 'MERCHANT' | 'P2P' | 'DEPOSIT' | 'API_PUSH'>('MANUAL');
  const [recipientAccount, setRecipientAccount] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const pageSize = 15;
  
  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    orderNumber: true,
    customer: true,
    phone: true,
    orderDate: true,
    daysOld: true,
    salesPerson: true,
    total: true,
    payment: true,
    status: true,
    actions: true,
  });
  
  // Delivery initiation states
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [deliveryType, setDeliveryType] = useState<'PAID' | 'FREE'>('PAID');
  const [deliveryRevenue, setDeliveryRevenue] = useState<string>('');
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState('MORNING (8AM-12PM)');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryPersonName, setDeliveryPersonName] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [creatingDelivery, setCreatingDelivery] = useState(false);

  // Reminder states
  const [sendingReminder, setSendingReminder] = useState<number | null>(null);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderOrder, setReminderOrder] = useState<Order | null>(null);
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderChannel, setReminderChannel] = useState<'sms' | 'whatsapp' | 'both'>('both');
  const [businessPhone, setBusinessPhone] = useState('');

  // Manual WhatsApp Messenger compose (editable before send)
  type WhatsAppComposeKind = 'receipt' | 'ready' | 'reminder' | 'custom';
  const [showWhatsAppCompose, setShowWhatsAppCompose] = useState(false);
  const [whatsAppComposeKind, setWhatsAppComposeKind] = useState<WhatsAppComposeKind>('receipt');
  const [whatsAppComposeMessage, setWhatsAppComposeMessage] = useState('');
  const [whatsAppComposeOrder, setWhatsAppComposeOrder] = useState<Order | null>(null);
  const [whatsAppComposeItems, setWhatsAppComposeItems] = useState<OrderItem[]>([]);
  const [whatsAppComposePhone, setWhatsAppComposePhone] = useState('');

  // Track if we've already auto-opened an order from navigation
  const hasAutoOpenedRef = useRef(false);

  // Handle search from navigation state
  useEffect(() => {
    if (location.state?.searchQuery) {
      setSearchQuery(location.state.searchQuery);
      // Clear the state after using it
      window.history.replaceState({}, document.title);
    }
    if (location.state?.searchOrderNumber) {
      setSearchQuery(location.state.searchOrderNumber);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        page: currentPage,
        limit: pageSize,
      };
      
      // Add search query if exists
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      
      // Add filters
      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }
      if (paymentFilter !== 'ALL') {
        params.payment_status = paymentFilter;
      }
      
      const response = await axios.get(`${API_BASE_URL}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setOrders(response.data.orders || []);
      setTotalOrders(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch orders',
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast, currentPage, searchQuery, statusFilter, paymentFilter]);

  useEffect(() => {
    if (!token) return;
    axios
      .get(`${API_BASE_URL}/settings/all`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setBusinessPhone(res.data.business_phone || ''))
      .catch(() => setBusinessPhone(''));
    axios
      .get(`${API_BASE_URL}/settings/payment-accounts`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setPaymentModes({ ...DEFAULT_PAYMENT_MODES, ...res.data }))
      .catch(() => setPaymentModes(DEFAULT_PAYMENT_MODES));
  }, [token]);

  const handleCancelPayment = async () => {
    if (!cancelPaymentTarget || !selectedOrder || !token) return;
    try {
      setCancellingPayment(true);
      const res = await axios.post(
        `${API_BASE_URL}/payments/${cancelPaymentTarget.id}/cancel`,
        { reason: cancelPaymentReason || 'Admin cancelled mistaken payment entry' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = res.data.order;
      toast({
        title: 'Payment cancelled',
        description: `Order is now ${updated.payment_status}. Balance: ${formatUGX(updated.balance)}`,
      });
      setCancelPaymentTarget(null);
      setCancelPaymentReason('');
      // Refresh order details + list
      setSelectedOrder((prev) =>
        prev
          ? {
              ...prev,
              amount_paid: updated.amount_paid,
              balance: updated.balance,
              payment_status: updated.payment_status,
              payment_method: updated.payment_method,
            }
          : prev
      );
      const paymentsResponse = await axios.get(`${API_BASE_URL}/payments/order/${selectedOrder.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPaymentTransactions(paymentsResponse.data || []);
      fetchOrders();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string; message?: string } } };
      toast({
        variant: 'destructive',
        title: 'Could not cancel payment',
        description: axiosError.response?.data?.message || axiosError.response?.data?.error || 'Failed',
      });
    } finally {
      setCancellingPayment(false);
    }
  };

  const buildWhatsAppTemplate = (
    kind: WhatsAppComposeKind,
    order: Order,
    items: OrderItem[]
  ): string => {
    switch (kind) {
      case 'receipt':
        return generateOrderReceiptMessage(order, items, paymentModes);
      case 'ready':
        return generateOrderReadyMessage(order);
      case 'reminder':
        return generateReminderMessage(order, businessPhone || undefined);
      case 'custom':
      default:
        return `Hello ${order.customer_name},\n\nThis is Lush Dry Cleaners & Laundromat regarding your order *${order.order_number}*.\n\n${businessPhone ? `📞 ${businessPhone}\n\n` : ''}Thank you for choosing Lush!`;
    }
  };

  const openWhatsAppCompose = async (
    order: Order,
    kind: WhatsAppComposeKind,
    itemsOverride?: OrderItem[]
  ) => {
    let items = itemsOverride;
    if (!items) {
      if (selectedOrder?.id === order.id && orderItems.length > 0) {
        items = orderItems;
      } else if (kind === 'receipt') {
        try {
          const response = await axios.get(`${API_BASE_URL}/orders/${order.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          items = response.data.items || [];
        } catch {
          items = [];
        }
      } else {
        items = [];
      }
    }

    setWhatsAppComposeOrder(order);
    setWhatsAppComposeItems(items || []);
    setWhatsAppComposeKind(kind);
    setWhatsAppComposePhone(order.customer_phone || '');
    setWhatsAppComposeMessage(buildWhatsAppTemplate(kind, order, items || []));
    setShowWhatsAppCompose(true);
  };

  const applyWhatsAppTemplate = (kind: WhatsAppComposeKind) => {
    if (!whatsAppComposeOrder) return;
    setWhatsAppComposeKind(kind);
    setWhatsAppComposeMessage(
      buildWhatsAppTemplate(kind, whatsAppComposeOrder, whatsAppComposeItems)
    );
  };

  const confirmOpenWhatsAppMessenger = () => {
    if (!whatsAppComposePhone?.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing phone',
        description: 'Customer needs a WhatsApp number on their profile.',
      });
      return;
    }
    if (!whatsAppComposeMessage.trim()) {
      toast({
        variant: 'destructive',
        title: 'Empty message',
        description: 'Write or customize the message before opening WhatsApp.',
      });
      return;
    }

    const opened = openWhatsAppMessenger(whatsAppComposePhone, whatsAppComposeMessage);
    if (opened) {
      toast({
        title: 'Opening WhatsApp Messenger',
        description: businessPhone
          ? `Send from your business WhatsApp (${businessPhone}). Review the message, then tap Send.`
          : 'Review the message on WhatsApp, then tap Send. Set business phone in Settings for branding.',
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Could not open WhatsApp',
        description: 'Check the customer phone number format.',
      });
    }
  };

  // Handle navigation from customer order history or dashboard
  useEffect(() => {
    if (location.state?.searchOrderNumber) {
      setSearchQuery(location.state.searchOrderNumber);
      // Clear the state to prevent re-triggering on navigation back
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Auto-open order when navigated from dashboard/customer history
  useEffect(() => {
    if (location.state?.searchOrderNumber && orders.length > 0 && !loading && !hasAutoOpenedRef.current) {
      // Find the order matching the search number
      const targetOrder = orders.find(o => o.order_number === location.state.searchOrderNumber);
      if (targetOrder) {
        // Mark that we've opened it
        hasAutoOpenedRef.current = true;
        
        // Clear the state FIRST to prevent re-opening
        window.history.replaceState({}, document.title);
        
        // Automatically open the order details
        setTimeout(() => {
          viewOrderDetails(targetOrder);
        }, 300);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, location.state?.searchOrderNumber, loading]);

  useEffect(() => {
    if (token) {
      fetchOrders();
    }
  }, [token, fetchOrders]);

  // Reset to page 1 when search/filters change
  useEffect(() => {
    setCurrentPage(prev => prev !== 1 ? 1 : prev);
  }, [searchQuery, statusFilter, paymentFilter]);

  // View order details
  const viewOrderDetails = async (order: Order) => {
    if (!order || !order.id) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Invalid order selected',
      });
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/orders/${order.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.data || !response.data.order) {
        throw new Error('Invalid response from server');
      }
      
      setSelectedOrder(response.data.order);
      setOrderItems(response.data.items || []);
      
      // Fetch payment transactions
      try {
        const paymentsResponse = await axios.get(`${API_BASE_URL}/payments/order/${order.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setPaymentTransactions(paymentsResponse.data || []);
        setPaymentTransactionsPage(1); // Reset to first page when viewing new order
      } catch (paymentError) {
        console.error('Error fetching payment transactions:', paymentError);
        setPaymentTransactions([]);
      }

      // Fetch delivery information
      try {
        const deliveryResponse = await axios.get(`${API_BASE_URL}/deliveries/order/${order.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setOrderDelivery(deliveryResponse.data.delivery || null);
      } catch (deliveryError) {
        console.error('Error fetching delivery information:', deliveryError);
        setOrderDelivery(null);
      }
      
      setShowDetailsDialog(true);
    } catch (error) {
      console.error('Error fetching order details:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast({
        variant: 'destructive',
        title: 'Error',
        description: axiosError.response?.data?.error || 'Failed to fetch order details. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Update payment
  const handleUpdatePayment = async () => {
    if (!selectedOrder || additionalPayment <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Amount',
        description: 'Please enter a valid payment amount',
      });
      return;
    }

    try {
      // Ensure numeric values are properly parsed
      const totalAmount = parseFloat(String(selectedOrder.total_amount));
      const currentPaid = parseFloat(String(selectedOrder.amount_paid));
      
      if (isNaN(totalAmount) || isNaN(currentPaid)) {
        toast({
          variant: 'destructive',
          title: 'Data Error',
          description: 'Invalid order amount data. Please refresh and try again.',
        });
        return;
      }
      
      const newAmountPaid = currentPaid + additionalPayment;
      const newBalance = Math.max(0, totalAmount - newAmountPaid);
      const newPaymentStatus = newBalance <= 0 ? 'PAID' : newBalance < totalAmount ? 'PARTIAL' : 'UNPAID';

      // Build payment method string with provider for mobile money
      let finalPaymentMethod: string = paymentMethod;
      if (paymentMethod === 'MOBILE_MONEY') {
        finalPaymentMethod = `MOBILE_MONEY_${mobileMoneyProvider}`;
      }

      await axios.put(
        `${API_BASE_URL}/orders/${selectedOrder.id}`,
        {
          amount_paid: newAmountPaid,
          balance: newBalance,
          payment_status: newPaymentStatus,
          payment_method: finalPaymentMethod,
          payment_channel: paymentChannel,
          recipient_account: recipientAccount || null,
          sender_phone: senderPhone || null,
          transaction_reference: transactionReference || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const paymentMethodDisplay = paymentMethod === 'MOBILE_MONEY' 
        ? `${mobileMoneyProvider} Mobile Money` 
        : paymentMethod.replace('_', ' ');

      const channelDisplay = paymentChannel === 'MERCHANT' ? ' via *165#/*185#' :
                            paymentChannel === 'P2P' ? ' (P2P)' :
                            paymentChannel === 'DEPOSIT' ? ' (Agent Deposit)' : '';

      toast({
        title: '✅ Payment Updated',
        description: `Added ${formatUGX(additionalPayment)} via ${paymentMethodDisplay}${channelDisplay}. ${newBalance <= 0 ? 'Order fully paid!' : `Balance: ${formatUGX(newBalance)}`}`,
      });

      setShowPaymentDialog(false);
      setAdditionalPayment(0);
      setPaymentMethod('CASH');
      setMobileMoneyProvider('MTN');
      setPaymentChannel('MANUAL');
      setRecipientAccount('');
      setSenderPhone('');
      setTransactionReference('');
      fetchOrders();
      if (selectedOrder) viewOrderDetails(selectedOrder);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update payment',
      });
    }
  };

  // Update order status
  const handleUpdateStatus = async () => {
    if (!selectedOrder || !newStatus) return;

    try {
      const response = await axios.put(
        `${API_BASE_URL}/orders/${selectedOrder.id}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: '✅ Status Updated',
        description: `Order status changed to ${newStatus}`,
      });

      setShowStatusDialog(false);
      setNewStatus('');
      
      // Refresh the orders list
      await fetchOrders();
      
      // Refresh the selected order details with fresh data from server
      if (selectedOrder && selectedOrder.id) {
        await viewOrderDetails(selectedOrder);
      }
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error || 'Failed to update status',
      });
    }
  };

  // Delete cancelled order (ADMIN only)
  const handleDeleteOrder = async () => {
    if (!selectedOrder) return;

    // Confirm deletion
    const confirmed = window.confirm(
      `⚠️ Are you sure you want to PERMANENTLY DELETE order ${selectedOrder.order_number}?\n\n` +
      `This will:\n` +
      `• Remove the order from all views\n` +
      `• Archive complete order data for audit\n` +
      `• This action CANNOT be undone\n\n` +
      `Customer: ${selectedOrder.customer_name}\n` +
      `Amount: ${formatUGX(selectedOrder.total_amount)}`
    );

    if (!confirmed) return;

    // Optional deletion reason
    const deletion_reason = window.prompt(
      'Reason for deletion (optional):',
      'Cancelled by administrator'
    );

    try {
      const response = await axios.delete(
        `${API_BASE_URL}/orders/${selectedOrder.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: { deletion_reason }
        }
      );

      toast({
        title: '🗑️ Order Deleted',
        description: response.data.message || 'Order has been permanently deleted and archived',
      });

      // Close dialog and refresh orders list
      setShowDetailsDialog(false);
      setSelectedOrder(null);
      await fetchOrders();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: err.response?.data?.error || 'Failed to delete order',
      });
    }
  };

  // Open reminder dialog with message preview
  const openReminderDialog = (order: Order) => {
    setReminderOrder(order);
    
    // Generate context-aware reminder message
    const message = generateReminderPreview(order);
    setReminderMessage(message);
    setShowReminderDialog(true);
  };

  // Generate reminder message preview (client-side)
  const generateReminderPreview = (order: Order): string => {
    return generateReminderMessage(order, businessPhone || undefined);
  };

  // Send reminder to customer
  const sendReminder = async () => {
    if (!reminderOrder) return;

    try {
      setSendingReminder(reminderOrder.id);
      
      const response = await axios.post(
        `${API_BASE_URL}/reminders/orders/${reminderOrder.id}/remind`,
        { 
          channel: reminderChannel,
          customMessage: reminderMessage // Send custom message if edited
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.data.success) {
        toast({
          title: 'Reminder Sent! 🔔',
          description: `Customer has been reminded about order ${reminderOrder.order_number}`,
          variant: 'default',
        });
        setShowReminderDialog(false);
      }
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      console.error('Send reminder error:', error);
      toast({
        title: 'Failed to Send Reminder',
        description: err.response?.data?.error || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSendingReminder(null);
    }
  };

  // Fetch delivery zones
  const fetchDeliveryZones = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/deliveries/zones`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeliveryZones(response.data.zones || []);
    } catch (error) {
      console.error('Failed to fetch delivery zones:', error);
    }
  };

  // Open delivery initiation dialog
  const openDeliveryDialog = async (order: Order) => {
    // Check if delivery already exists for this order
    try {
      const response = await axios.get(`${API_BASE_URL}/deliveries/order/${order.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.data.delivery) {
        // Delivery already exists - redirect directly to its details
        toast({
          title: '📦 Delivery Already Exists',
          description: 'Opening delivery details...',
        });
        
        // Navigate directly to the specific delivery
        setTimeout(() => {
          navigate(`/deliveries?orderId=${order.id}`);
        }, 500);
        return;
      }
    } catch (error) {
      console.error('Error checking delivery:', error);
    }
    
    // No delivery exists, proceed with dialog
    setSelectedOrder(order);
    setDeliveryType('PAID');
    setDeliveryRevenue('');
    setSelectedZoneId('');
    setDeliveryAddress('');
    setDeliveryDate(new Date().toISOString().split('T')[0]);
    setDeliveryTimeSlot('MORNING (8AM-12PM)');
    setDeliveryNotes('');
    setDeliveryPersonName('');
    setVehicleInfo('');
    setShowDeliveryDialog(true);
    fetchDeliveryZones();
  };

  // Handle delivery initiation
  const handleInitiateDelivery = async () => {
    if (!selectedOrder) return;
    
    // Validation: For PAID deliveries, revenue is required
    if (deliveryType === 'PAID' && (!deliveryRevenue || parseFloat(deliveryRevenue) <= 0)) {
      toast({
        variant: 'destructive',
        title: 'Revenue Required',
        description: 'Please enter delivery revenue amount for paid delivery',
      });
      return;
    }
    
    try {
      setCreatingDelivery(true);
      const payload: {
        order_id: number;
        delivery_type: string;
        delivery_revenue?: number;
        scheduled_date: string;
        scheduled_time_slot: string;
        delivery_zone_id?: number;
        delivery_address?: string;
        delivery_notes?: string;
        delivery_person_name?: string;
        vehicle_info?: string;
      } = {
        order_id: selectedOrder.id,
        delivery_type: deliveryType,
        scheduled_date: deliveryDate,
        scheduled_time_slot: deliveryTimeSlot,
      };
      
      // Add delivery revenue for PAID deliveries
      if (deliveryType === 'PAID') {
        payload.delivery_revenue = parseFloat(deliveryRevenue);
        payload.delivery_zone_id = selectedZoneId ? parseInt(selectedZoneId) : undefined;
        payload.delivery_address = deliveryAddress;
      }
      
      if (deliveryNotes) {
        payload.delivery_notes = deliveryNotes;
      }
      
      if (deliveryPersonName) {
        payload.delivery_person_name = deliveryPersonName;
      }
      
      if (vehicleInfo) {
        payload.vehicle_info = vehicleInfo;
      }
      
      await axios.post(
        `${API_BASE_URL}/deliveries`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast({
        title: '✅ Delivery Initiated',
        description: `${deliveryType === 'PAID' ? 'Paid delivery' : 'Free delivery (offer)'} scheduled for ${selectedOrder.order_number}`,
      });
      
      setShowDeliveryDialog(false);
      setDeliveryRevenue('');
      setSelectedZoneId('');
      setDeliveryAddress('');
      setDeliveryNotes('');
      fetchOrders();
    } catch (error) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast({
        variant: 'destructive',
        title: 'Failed to Initiate Delivery',
        description: axiosError.response?.data?.error || 'Something went wrong',
      });
    } finally {
      setCreatingDelivery(false);
    }
  };

  // Check if order is overdue (based on due_date for payment, not pickup)
  const isOverdue = (order: Order) => {
    if (!order.due_date) return false;
    const dueDate = new Date(order.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    // Overdue if past due date AND not fully paid
    return dueDate < today && order.payment_status !== 'PAID';
  };

  // Get overdue styling based on urgency (payment status)
  const getOverdueStyle = (order: Order) => {
    if (!isOverdue(order)) return { rowClass: '', iconClass: '', textClass: '' };
    
    // High urgency: UNPAID or PARTIAL payment (money issue)
    if (order.payment_status === 'UNPAID' || order.payment_status === 'PARTIAL') {
      return {
        rowClass: 'bg-red-50 dark:bg-red-950/20',
        iconClass: 'text-red-600',
        textClass: 'text-red-600'
      };
    }
    
    // Low urgency: PAID but not picked up (just reminder needed)
    return {
      rowClass: 'bg-yellow-50 dark:bg-yellow-950/20',
      iconClass: 'text-yellow-600',
      textClass: 'text-yellow-600'
    };
  };

  // Use orders directly - backend handles filtering
  const filteredOrders = orders;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pending: { variant: 'secondary', label: 'Pending' },
      processing: { variant: 'default', label: 'Processing' },
      ready: { variant: 'outline', label: 'Ready' },
      delivered: { variant: 'outline', label: 'Delivered' },
      cancelled: { variant: 'destructive', label: 'Cancelled' },
    };
    const config = variants[status] || variants.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPaymentBadge = (status: string) => {
    const variants: Record<string, { className: string; label: string }> = {
      PAID: { className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: 'Paid' },
      UNPAID: { className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', label: 'Unpaid' },
      PARTIAL: { className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', label: 'Partial' },
    };
    const config = variants[status] || variants.UNPAID;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <MainLayout title="Orders" subtitle="Manage customer orders">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by order number, customer name, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            {canCancelOrders && (
              <SelectItem value="cancelled">Cancelled</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Payment</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="UNPAID">Unpaid</SelectItem>
            <SelectItem value="PARTIAL">Partial</SelectItem>
          </SelectContent>
        </Select>

        {/* Column Visibility Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={visibleColumns.orderNumber}
              onCheckedChange={(checked) => setVisibleColumns(prev => ({ ...prev, orderNumber: checked }))}
            >
              Order Number
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.customer}
              onCheckedChange={(checked) => setVisibleColumns(prev => ({ ...prev, customer: checked }))}
            >
              Customer
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.phone}
              onCheckedChange={(checked) => setVisibleColumns(prev => ({ ...prev, phone: checked }))}
            >
              Phone
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.orderDate}
              onCheckedChange={(checked) => setVisibleColumns(prev => ({ ...prev, orderDate: checked }))}
            >
              Order Date
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.daysOld}
              onCheckedChange={(checked) => setVisibleColumns(prev => ({ ...prev, daysOld: checked }))}
            >
              Days Old / Overdue
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.salesPerson}
              onCheckedChange={(checked) => setVisibleColumns(prev => ({ ...prev, salesPerson: checked }))}
            >
              Sales Person
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.total}
              onCheckedChange={(checked) => setVisibleColumns(prev => ({ ...prev, total: checked }))}
            >
              Total Amount
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.payment}
              onCheckedChange={(checked) => setVisibleColumns(prev => ({ ...prev, payment: checked }))}
            >
              Payment Status
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.status}
              onCheckedChange={(checked) => setVisibleColumns(prev => ({ ...prev, status: checked }))}
            >
              Order Status
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visibleColumns.actions}
              onCheckedChange={(checked) => setVisibleColumns(prev => ({ ...prev, actions: checked }))}
            >
              Actions
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Orders Table */}
      <div className="bg-card rounded-lg border">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.orderNumber && <TableHead>Order #</TableHead>}
              {visibleColumns.customer && <TableHead>Customer</TableHead>}
              {visibleColumns.phone && <TableHead>Phone</TableHead>}
              {visibleColumns.orderDate && <TableHead>Order Date</TableHead>}
              {visibleColumns.daysOld && <TableHead>Days Old</TableHead>}
              {visibleColumns.salesPerson && <TableHead>Sales Person</TableHead>}
              {visibleColumns.total && <TableHead>Total</TableHead>}
              {visibleColumns.payment && <TableHead>Payment</TableHead>}
              {visibleColumns.status && <TableHead>Status</TableHead>}
              {visibleColumns.actions && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={Object.values(visibleColumns).filter(Boolean).length} className="text-center py-8">
                  Loading orders...
                </TableCell>
              </TableRow>
            ) : filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={Object.values(visibleColumns).filter(Boolean).length} className="text-center py-8 text-muted-foreground">
                  No orders found
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => {
                const overdueStyle = getOverdueStyle(order);
                return (
                <TableRow key={order.id} className={overdueStyle.rowClass}>
                  {visibleColumns.orderNumber && (
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {order.order_number}
                        {isOverdue(order) && (
                          <AlertCircle className={`h-4 w-4 ${overdueStyle.iconClass}`} />
                        )}
                      </div>
                    </TableCell>
                  )}
                  {visibleColumns.customer && <TableCell>{order.customer_name}</TableCell>}
                  {visibleColumns.phone && <TableCell>{order.customer_phone}</TableCell>}
                  {visibleColumns.orderDate && <TableCell className="text-sm">{formatDate(order.created_at)}</TableCell>}
                  {visibleColumns.daysOld && (
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm">{getDaysOld(order.created_at)}</span>
                        {isOverdue(order) && (
                          <Badge variant="destructive" className="text-xs w-fit">OVERDUE</Badge>
                        )}
                      </div>
                    </TableCell>
                  )}
                  {visibleColumns.salesPerson && (
                    <TableCell className="text-sm">
                      <div className="flex flex-col">
                        <span className="font-medium">{order.staff_name || 'N/A'}</span>
                        {order.user_role && (
                          <span className="text-xs text-muted-foreground">{order.user_role}</span>
                        )}
                      </div>
                    </TableCell>
                  )}
                  {visibleColumns.total && (
                    <TableCell className="font-semibold">
                      <div>
                        {formatUGX(order.total_amount)}
                        {order.balance > 0 && (
                          <p className="text-xs text-red-600">Balance: {formatUGX(order.balance)}</p>
                        )}
                      </div>
                    </TableCell>
                  )}
                  {visibleColumns.payment && <TableCell>{getPaymentBadge(order.payment_status)}</TableCell>}
                  {visibleColumns.status && <TableCell>{getStatusBadge(order.order_status)}</TableCell>}
                  {visibleColumns.actions && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewOrderDetails(order)}
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {/* Only show Remind button for orders that need reminders */}
                        {!(order.order_status === 'delivered' && order.payment_status === 'PAID') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openReminderDialog(order)}
                            disabled={sendingReminder === order.id}
                            title="Remind customer"
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                          >
                            <Bell className={`h-4 w-4 ${sendingReminder === order.id ? 'animate-pulse' : ''}`} />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Share receipt"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Share Receipt</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem
                              onClick={() => {
                                setInvoiceOrderId(order.id);
                                setShowInvoiceDialog(true);
                              }}
                            >
                              <Printer className="h-4 w-4 mr-2" />
                              Print Receipt
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                              onClick={() => {
                                void openWhatsAppCompose(order, 'receipt');
                              }}
                            >
                              <MessageCircle className="h-4 w-4 mr-2" />
                              WhatsApp Receipt
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                              onClick={() => {
                                void openWhatsAppCompose(order, 'ready');
                              }}
                            >
                              <MessageCircle className="h-4 w-4 mr-2" />
                              Notify Ready (WhatsApp)
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                              onClick={() => {
                                setInvoiceOrderId(order.id);
                                setShowInvoiceDialog(true);
                              }}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download PDF
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem disabled>
                              <Mail className="h-4 w-4 mr-2" />
                              Send via Email
                              <Badge variant="outline" className="ml-2 text-xs">Soon</Badge>
                            </DropdownMenuCheckboxItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              )})
            )}
          </TableBody>
        </Table>
        </div>

        {/* Pagination */}
        {totalOrders > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t gap-3">
            <div className="text-sm text-muted-foreground">
              <span className="hidden sm:inline">Showing {Math.min((currentPage - 1) * pageSize + 1, totalOrders)} to {Math.min(currentPage * pageSize, totalOrders)} of {totalOrders} orders</span>
              <span className="sm:hidden">{Math.min((currentPage - 1) * pageSize + 1, totalOrders)}-{Math.min(currentPage * pageSize, totalOrders)} of {totalOrders}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-center sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              
              {/* Advanced Page Numbers with First/Last Always Visible */}
              <div className="flex items-center gap-1 flex-wrap justify-center">
                {(() => {
                  const totalPages = Math.ceil(totalOrders / pageSize);
                  const pages: (number | string)[] = [];
                  
                  // Always show page 1
                  pages.push(1);
                  
                  if (totalPages <= 7) {
                    // Show all pages if 7 or fewer
                    for (let i = 2; i <= totalPages; i++) {
                      pages.push(i);
                    }
                  } else {
                    // Show: 1 ... [current-1, current, current+1] ... last
                    
                    // Add ellipsis after 1 if needed
                    if (currentPage > 3) {
                      pages.push('...');
                    }
                    
                    // Add page 2 if current is near start
                    if (currentPage === 3) {
                      pages.push(2);
                    }
                    
                    // Add pages around current (but not 1 or last)
                    const start = Math.max(2, currentPage - 1);
                    const end = Math.min(totalPages - 1, currentPage + 1);
                    
                    for (let i = start; i <= end; i++) {
                      if (!pages.includes(i)) {
                        pages.push(i);
                      }
                    }
                    
                    // Add second-to-last page if current is near end
                    if (currentPage === totalPages - 2) {
                      if (!pages.includes(totalPages - 1)) {
                        pages.push(totalPages - 1);
                      }
                    }
                    
                    // Add ellipsis before last if needed
                    if (currentPage < totalPages - 2) {
                      pages.push('...');
                    }
                    
                    // Always show last page
                    if (!pages.includes(totalPages)) {
                      pages.push(totalPages);
                    }
                  }
                  
                  return pages.map((page, index) => {
                    if (page === '...') {
                      return (
                        <span key={`ellipsis-${index}`} className="text-muted-foreground px-1 sm:px-2">
                          •••
                        </span>
                      );
                    }
                    
                    const pageNumber = page as number;
                    return (
                      <Button
                        key={pageNumber}
                        variant={currentPage === pageNumber ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNumber)}
                        disabled={loading}
                        className="w-8 sm:w-10 px-0"
                      >
                        {pageNumber}
                      </Button>
                    );
                  });
                })()}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalOrders / pageSize), p + 1))}
                disabled={currentPage >= Math.ceil(totalOrders / pageSize) || loading}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4 sm:ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Order Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Order Details - {selectedOrder?.order_number}</DialogTitle>
            <DialogDescription>
              Complete information about this order
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6 min-w-0">
              {/* Customer Information */}
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Customer Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium">{selectedOrder.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      {selectedOrder.customer_phone}
                    </p>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Order Items ({orderItems.length})
                </h3>
                <div className="border rounded-lg overflow-x-auto">
                  <Table className="min-w-[400px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap px-2 sm:px-4">Item</TableHead>
                        <TableHead className="whitespace-nowrap px-2 sm:px-4">Service</TableHead>
                        <TableHead className="whitespace-nowrap px-2 sm:px-4">Quantity</TableHead>
                        <TableHead className="whitespace-nowrap px-2 sm:px-4">Unit Price</TableHead>
                        <TableHead className="whitespace-nowrap px-2 sm:px-4">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium px-2 sm:px-4">{item.item_name}</TableCell>
                          <TableCell className="px-2 sm:px-4">
                            <Badge variant="outline" className="uppercase">
                              {item.service_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-2 sm:px-4">{item.quantity}</TableCell>
                          <TableCell className="px-2 sm:px-4 whitespace-nowrap">{formatUGX(item.unit_price)}</TableCell>
                          <TableCell className="font-semibold px-2 sm:px-4 whitespace-nowrap">{formatUGX(item.total_price)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Payment Transactions History */}
              {paymentTransactions.length > 0 && (
                <div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-lg flex items-center gap-2 min-w-0">
                      <CreditCard className="h-5 w-5 text-green-600 flex-shrink-0" />
                      <span className="truncate">Payment Transactions ({paymentTransactions.length})</span>
                      {paymentTransactions.length > paymentTransactionsPerPage && (
                        <span className="text-sm text-muted-foreground font-normal whitespace-nowrap">
                          (Page {paymentTransactionsPage} of {Math.ceil(paymentTransactions.length / paymentTransactionsPerPage)})
                        </span>
                      )}
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900 w-full sm:w-auto flex-shrink-0"
                      onClick={() => {
                        if (selectedOrder) {
                          navigate(`/payments?orderNumber=${selectedOrder.order_number}`);
                        }
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1 flex-shrink-0" />
                      <span className="hidden sm:inline">View in Payments</span>
                      <span className="sm:hidden">View Payments</span>
                    </Button>
                  </div>
                  <div className="border rounded-lg overflow-x-auto">
                    <Table className="min-w-[650px]">
                      <TableHeader>
                        <TableRow className="bg-green-50 dark:bg-green-950">
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Date & Time</TableHead>
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Method</TableHead>
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Amount</TableHead>
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Reference</TableHead>
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Received By</TableHead>
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Notes</TableHead>
                          {isAdmin && <TableHead className="whitespace-nowrap px-2 sm:px-4">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paymentTransactions
                          .slice(
                            (paymentTransactionsPage - 1) * paymentTransactionsPerPage,
                            paymentTransactionsPage * paymentTransactionsPerPage
                          )
                          .map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell className="font-medium px-2 sm:px-4 whitespace-nowrap">
                              {formatDateTime(payment.payment_date)}
                            </TableCell>
                            <TableCell className="px-2 sm:px-4">
                              <Badge variant="outline" className="bg-green-100 dark:bg-green-900">
                                {payment.payment_method.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold text-green-600 px-2 sm:px-4 whitespace-nowrap">
                              {formatUGX(payment.amount)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground px-2 sm:px-4">
                              {payment.transaction_reference || 'N/A'}
                            </TableCell>
                            <TableCell className="text-sm px-2 sm:px-4">
                              {payment.received_by || 'System'}
                            </TableCell>
                            <TableCell className="text-sm px-2 sm:px-4">
                              <div className="flex items-center gap-2">
                                <span className="truncate max-w-[120px]">{payment.notes || '-'}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  title="Open in Payments"
                                  onClick={() => navigate(`/payments?orderNumber=${selectedOrder.order_number}`)}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                            {isAdmin && Number(payment.amount) > 0 && (
                              <TableCell className="px-2 sm:px-4">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50"
                                  onClick={() => {
                                    setCancelPaymentTarget(payment);
                                    setCancelPaymentReason('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </TableCell>
                            )}
                            {isAdmin && Number(payment.amount) <= 0 && <TableCell />}
                          </TableRow>
                        ))}
                        <TableRow className="bg-green-50 dark:bg-green-950 font-bold">
                          <TableCell colSpan={2} className="px-2 sm:px-4">Total Payments:</TableCell>
                          <TableCell className="text-green-600 font-bold px-2 sm:px-4 whitespace-nowrap">
                            {formatUGX(paymentTransactions.reduce((sum, p) => sum + Number(p.amount), 0))}
                          </TableCell>
                          <TableCell colSpan={isAdmin ? 4 : 3}></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    
                    {/* Pagination for Payment Transactions */}
                    {paymentTransactions.length > paymentTransactionsPerPage && (
                      <div className="flex flex-col sm:flex-row items-center justify-between p-2 sm:p-3 border-t bg-muted/50 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPaymentTransactionsPage(p => Math.max(1, p - 1))}
                          disabled={paymentTransactionsPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Previous</span>
                        </Button>
                        <span className="text-xs sm:text-sm text-muted-foreground text-center">
                          <span className="hidden sm:inline">Showing {((paymentTransactionsPage - 1) * paymentTransactionsPerPage) + 1} - {Math.min(paymentTransactionsPage * paymentTransactionsPerPage, paymentTransactions.length)} of {paymentTransactions.length} transactions</span>
                          <span className="sm:hidden">{((paymentTransactionsPage - 1) * paymentTransactionsPerPage) + 1}-{Math.min(paymentTransactionsPage * paymentTransactionsPerPage, paymentTransactions.length)} of {paymentTransactions.length}</span>
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPaymentTransactionsPage(p => Math.min(Math.ceil(paymentTransactions.length / paymentTransactionsPerPage), p + 1))}
                          disabled={paymentTransactionsPage >= Math.ceil(paymentTransactions.length / paymentTransactionsPerPage)}
                        >
                          <span className="hidden sm:inline">Next</span>
                          <ChevronRight className="h-4 w-4 sm:ml-1" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* No Payment Transactions Warning */}
              {paymentTransactions.length === 0 && selectedOrder.payment_status !== 'UNPAID' && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <p className="font-medium text-yellow-800 dark:text-yellow-200">
                      No Payment Transactions Found
                    </p>
                  </div>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    This order is marked as {selectedOrder.payment_status} with {formatUGX(selectedOrder.amount_paid)} paid,
                    but no payment ledger row exists for accounting. Use <strong>Add Payment</strong> below, or redeploy
                    so the server auto-backfills missing cash payments.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-yellow-600 text-yellow-800"
                    onClick={() => {
                      const totalAmt = parseFloat(String(selectedOrder.total_amount)) || 0;
                      const paidAmt = parseFloat(String(selectedOrder.amount_paid)) || 0;
                      const remaining = Math.max(0, totalAmt - paidAmt);
                      setAdditionalPayment(remaining > 0 ? remaining : totalAmt);
                      setPaymentMethod('CASH');
                      setShowPaymentDialog(true);
                    }}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Add Payment Now
                  </Button>
                </div>
              )}

              {paymentTransactions.length === 0 && selectedOrder.payment_status === 'UNPAID' && (
                <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <p className="font-medium text-red-800 dark:text-red-200">
                      Unpaid Order - No Payments Yet
                    </p>
                  </div>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Balance: {formatUGX(selectedOrder.balance)} remaining.
                    Click &quot;Add Payment&quot; below to record a payment transaction.
                  </p>
                </div>
              )}

              {/* Order Summary */}
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment & Summary
                </h3>
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-medium">{formatUGX(selectedOrder.subtotal)}</span>
                  </div>
                  {selectedOrder.discount_percentage > 0 && (
                    <div className="flex justify-between text-primary">
                      <span>Discount ({selectedOrder.discount_percentage}%):</span>
                      <span className="font-medium">-{formatUGX(selectedOrder.discount_amount)}</span>
                    </div>
                  )}
                  {selectedOrder.bargain_amount > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Bargain Deduction:</span>
                      <span className="font-medium">-{formatUGX(selectedOrder.bargain_amount)}</span>
                    </div>
                  )}
                  {selectedOrder.tax_amount > 0 && (
                    <div className="flex justify-between text-blue-600">
                      <span>VAT ({selectedOrder.tax_rate}%):</span>
                      <span className="font-medium">+{formatUGX(selectedOrder.tax_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold pt-2 border-t">
                    <span>Total Amount:</span>
                    <span>{formatUGX(selectedOrder.total_amount)}</span>
                  </div>
                  <div className="pt-2 border-t space-y-2">
                    <div className="flex justify-between">
                      <span>Payment Status:</span>
                      {getPaymentBadge(selectedOrder.payment_status)}
                    </div>
                    <div className="flex justify-between">
                      <span>Payment Method:</span>
                      <span className="font-medium">{selectedOrder.payment_method ? selectedOrder.payment_method.replace(/_/g, ' ') : 'Not specified'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Amount Paid:</span>
                      <span className="font-semibold text-green-600">{formatUGX(selectedOrder.amount_paid)}</span>
                    </div>
                    {selectedOrder.balance > 0 && (
                      <div className="flex justify-between">
                        <span>Balance:</span>
                        <span className="font-semibold text-red-600">{formatUGX(selectedOrder.balance)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Delivery Information */}
              {orderDelivery && (
                <div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-lg flex items-center gap-2 min-w-0">
                      <Truck className="h-5 w-5 text-purple-600 flex-shrink-0" />
                      <span className="truncate">Delivery Information</span>
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-purple-600 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900 w-full sm:w-auto flex-shrink-0"
                      onClick={() => {
                        if (selectedOrder) {
                          navigate(`/deliveries?orderId=${selectedOrder.id}`);
                        }
                      }}
                    >
                      <Truck className="h-3 w-3 mr-1 flex-shrink-0" />
                      View Delivery
                    </Button>
                  </div>
                  <div className="border rounded-lg p-4 space-y-3 bg-purple-50 dark:bg-purple-950">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Type</p>
                        <p className="font-medium">
                          {orderDelivery.delivery_type === 'PAID' ? '🚚 PAID Delivery' : '🎁 FREE Delivery (Offer)'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Status</p>
                        <Badge variant={
                          orderDelivery.delivery_status === 'DELIVERED' ? 'default' :
                          orderDelivery.delivery_status === 'IN_TRANSIT' ? 'secondary' :
                          orderDelivery.delivery_status === 'FAILED' ? 'destructive' :
                          'outline'
                        }>
                          {orderDelivery.delivery_status}
                        </Badge>
                      </div>
                      {orderDelivery.delivery_type === 'PAID' && (
                        <div>
                          <p className="text-sm text-muted-foreground">Delivery Revenue</p>
                          <p className="font-semibold text-purple-700 dark:text-purple-300">
                            {formatUGX(orderDelivery.delivery_revenue || 0)}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-muted-foreground">Scheduled Date</p>
                        <p className="font-medium">{formatDate(orderDelivery.scheduled_date)}</p>
                      </div>
                      {orderDelivery.scheduled_time_slot && (
                        <div className="col-span-2">
                          <p className="text-sm text-muted-foreground">Time Slot</p>
                          <p className="font-medium">{orderDelivery.scheduled_time_slot}</p>
                        </div>
                      )}
                      {orderDelivery.delivery_address && (
                        <div className="col-span-2">
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            Delivery Address
                          </p>
                          <p className="font-medium">{orderDelivery.delivery_address}</p>
                        </div>
                      )}
                      {(orderDelivery.driver_name || orderDelivery.delivery_person_name) && (
                        <div>
                          <p className="text-sm text-muted-foreground">Rider/Driver</p>
                          <p className="font-medium">{orderDelivery.driver_name || orderDelivery.delivery_person_name}</p>
                        </div>
                      )}
                      {orderDelivery.vehicle_info && (
                        <div>
                          <p className="text-sm text-muted-foreground">Vehicle</p>
                          <p className="font-medium">{orderDelivery.vehicle_info}</p>
                        </div>
                      )}
                      {orderDelivery.zone_name && (
                        <div>
                          <p className="text-sm text-muted-foreground">Zone</p>
                          <p className="font-medium">{orderDelivery.zone_name}</p>
                        </div>
                      )}
                    </div>
                    {orderDelivery.delivery_notes && (
                      <div className="pt-2 border-t">
                        <p className="text-sm text-muted-foreground">Delivery Notes</p>
                        <p className="text-sm">{orderDelivery.delivery_notes}</p>
                      </div>
                    )}
                    {orderDelivery.delivery_status === 'DELIVERED' && orderDelivery.delivery_type === 'PAID' && (
                      <div className="pt-2 border-t bg-green-100 dark:bg-green-900 p-2 rounded">
                        <p className="text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          Revenue of {formatUGX(orderDelivery.delivery_revenue)} counted in financial reports
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Order Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="p-3 sm:p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Order Date
                  </p>
                  <p className="font-medium">{formatDateTime(selectedOrder.created_at)}</p>
                </div>
                <div className="p-3 sm:p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Collection Date
                  </p>
                  <p className="font-medium">
                    {selectedOrder.pickup_date ? formatDate(selectedOrder.pickup_date) : (
                      <span className="text-muted-foreground italic">Not collected yet</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div>
                  <h3 className="font-semibold text-lg mb-2">Special Instructions</h3>
                  <p className="p-4 bg-muted rounded-lg">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span className="font-medium">Current Order Status:</span>
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedOrder.order_status)}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNewStatus(selectedOrder.order_status);
                      setShowStatusDialog(true);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Update
                  </Button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-green-600" />
                  WhatsApp Messenger
                </h3>
                <p className="text-sm text-muted-foreground">
                  Opens WhatsApp on this computer/phone so you can send from your business WhatsApp account.
                  Edit the message first, then tap Send in Messenger.
                  {businessPhone ? (
                    <span className="block mt-1 text-green-700 dark:text-green-400">
                      Business contact on messages: {businessPhone} (from Settings)
                    </span>
                  ) : (
                    <span className="block mt-1 text-amber-700 dark:text-amber-400">
                      Tip: set Business Phone in Settings so receipts include your number.
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                  <Button
                    onClick={() => void openWhatsAppCompose(selectedOrder, 'receipt', orderItems)}
                    variant="outline"
                    className="gap-2 border-green-600 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Send Receipt
                  </Button>
                  <Button
                    onClick={() => void openWhatsAppCompose(selectedOrder, 'ready', orderItems)}
                    variant="outline"
                    className="gap-2 border-green-600 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Notify Order Ready
                  </Button>
                  {!(selectedOrder.order_status === 'delivered' && selectedOrder.payment_status === 'PAID') && (
                    <Button
                      onClick={() => void openWhatsAppCompose(selectedOrder, 'reminder', orderItems)}
                      variant="outline"
                      className="gap-2 border-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900"
                    >
                      <Bell className="h-4 w-4" />
                      Send Reminder
                    </Button>
                  )}
                  <Button
                    onClick={() => void openWhatsAppCompose(selectedOrder, 'custom', orderItems)}
                    variant="outline"
                    className="gap-2 border-green-600 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Custom Message
                  </Button>
                </div>

                <h3 className="font-semibold text-lg flex items-center gap-2 mt-6">
                  <Printer className="h-5 w-5 text-blue-600" />
                  Print Receipt
                </h3>
                <div className="flex flex-wrap gap-2 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Button
                    onClick={() => printReceipt(selectedOrder, orderItems)}
                    variant="outline"
                    className="gap-2 border-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
                  >
                    <Printer className="h-4 w-4" />
                    Print Order Receipt
                  </Button>
                  <p className="text-sm text-gray-600 dark:text-gray-400 w-full mt-2">
                    Opens the print dialog for thermal (80mm) or regular printers connected to this computer.
                  </p>
                </div>

                <h3 className="font-semibold text-lg">Order Actions</h3>
                <div className="flex flex-wrap gap-2">
                {(selectedOrder.payment_status !== 'PAID'
                  || Number(selectedOrder.amount_paid) <= 0
                  || paymentTransactions.length === 0) && (
                  <Button
                    onClick={() => {
                      const remaining = Math.max(
                        0,
                        parseFloat(String(selectedOrder.total_amount)) - parseFloat(String(selectedOrder.amount_paid))
                      );
                      setAdditionalPayment(
                        remaining > 0
                          ? remaining
                          : parseFloat(String(selectedOrder.total_amount)) || 0
                      );
                      setShowPaymentDialog(true);
                    }}
                    variant="default"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Add Payment
                  </Button>
                )}
                {selectedOrder.order_status === 'pending' && (
                  <Button
                    onClick={() => {
                      setNewStatus('PROCESSING');
                      handleUpdateStatus();
                    }}
                    variant="outline"
                  >
                    Start Processing
                  </Button>
                )}
                {selectedOrder.order_status === 'processing' && (
                  <Button
                    onClick={() => {
                      setNewStatus('READY');
                      handleUpdateStatus();
                    }}
                    variant="outline"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Mark as Ready
                  </Button>
                )}
                {selectedOrder.order_status === 'ready' && !orderDelivery && (
                  <Button
                    onClick={() => openDeliveryDialog(selectedOrder)}
                    variant="default"
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Truck className="h-4 w-4 mr-2" />
                    Initiate Delivery
                  </Button>
                )}
                {selectedOrder.order_status === 'ready' && orderDelivery && (
                  <Button
                    onClick={() => navigate(`/deliveries?orderId=${selectedOrder.id}`)}
                    variant="outline"
                    className="border-purple-600 text-purple-600 hover:bg-purple-50"
                  >
                    <Truck className="h-4 w-4 mr-2" />
                    View Delivery Details
                  </Button>
                )}
                {selectedOrder.order_status === 'ready' && (
                  <Button
                    onClick={() => {
                      setNewStatus('DELIVERED');
                      handleUpdateStatus();
                    }}
                    variant="outline"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Mark as Delivered
                  </Button>
                )}
                {/* Refund Button - ADMIN/MANAGER can process directly, DESKTOP_AGENT can request */}
                {selectedOrder.amount_paid > 0 && (
                  <Button
                    onClick={() => setShowRefundDialog(true)}
                    variant="outline"
                    className="gap-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <CreditCard className="h-4 w-4" />
                    {user?.role === 'DESKTOP_AGENT' ? 'Request Refund' : 'Process Refund'}
                  </Button>
                )}
                {/* ADMIN ONLY: Delete Cancelled Orders */}
                {canCancelOrders && selectedOrder.order_status === 'cancelled' && (
                  <Button
                    onClick={handleDeleteOrder}
                    variant="destructive"
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Order (Permanent)
                  </Button>
                )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Add Payment</DialogTitle>
            <DialogDescription>
              Record additional payment for order {selectedOrder?.order_number}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span>Total Amount:</span>
                  <span className="font-semibold">{formatUGX(selectedOrder.total_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Already Paid:</span>
                  <span className="font-semibold text-green-600">{formatUGX(selectedOrder.amount_paid)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Balance Due:</span>
                  <span className="text-red-600">{formatUGX(selectedOrder.balance)}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="additional-payment">Payment Amount (UGX)</Label>
                <Input
                  id="additional-payment"
                  type="number"
                  min="0"
                  max={selectedOrder.balance}
                  value={additionalPayment || ''}
                  onChange={(e) => setAdditionalPayment(parseFloat(e.target.value) || 0)}
                  placeholder="Enter amount"
                  className="mt-2"
                />
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setAdditionalPayment(parseFloat(String(selectedOrder.balance)))}
                  className="mt-1"
                >
                  Pay Full Balance
                </Button>
              </div>

              <div>
                <Label htmlFor="payment-method">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(value: 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER') => setPaymentMethod(value)}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="MOBILE_MONEY">Mobile Money (MTN/Airtel)</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {paymentMethod === 'CASH' && '💵 Cash payment'}
                  {paymentMethod === 'MOBILE_MONEY' && '📱 MTN Mobile Money or Airtel Money'}
                  {paymentMethod === 'BANK_TRANSFER' && '🏦 Bank transfer'}
                </p>
              </div>

              {paymentMethod === 'MOBILE_MONEY' && (
                <>
                  <div>
                    <Label htmlFor="mobile-provider">Mobile Money Provider</Label>
                    <Select value={mobileMoneyProvider} onValueChange={(value: 'MTN' | 'AIRTEL') => setMobileMoneyProvider(value)}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MTN">MTN Mobile Money</SelectItem>
                        <SelectItem value="AIRTEL">Airtel Money</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="payment-channel">How was payment received? ⭐</Label>
                    <Select value={paymentChannel} onValueChange={(value: 'MANUAL' | 'MERCHANT' | 'P2P' | 'DEPOSIT' | 'API_PUSH') => setPaymentChannel(value)}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Select payment channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MERCHANT">
                          <div className="flex items-center gap-2">
                            <span>🏪</span>
                            <div>
                              <div className="font-medium">Merchant Code ({mobileMoneyProvider === 'MTN' ? '*165#' : '*185#'})</div>
                              <div className="text-xs text-muted-foreground">Recommended - Customer paid via USSD code</div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="P2P">
                          <div className="flex items-center gap-2">
                            <span>📱</span>
                            <div>
                              <div className="font-medium">Phone Transfer (P2P)</div>
                              <div className="text-xs text-muted-foreground">Customer sent money directly to your number</div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="DEPOSIT">
                          <div className="flex items-center gap-2">
                            <span>🏦</span>
                            <div>
                              <div className="font-medium">Agent Deposit</div>
                              <div className="text-xs text-muted-foreground">Customer deposited cash at MoMo agent</div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="MANUAL">
                          <div className="flex items-center gap-2">
                            <span>✍️</span>
                            <div>
                              <div className="font-medium">Manual Entry</div>
                              <div className="text-xs text-muted-foreground">Recording existing payment</div>
                            </div>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {paymentChannel === 'MERCHANT' && '✅ Best for reconciliation - structured reference'}
                      {paymentChannel === 'P2P' && '⚠️ Requires manual matching with phone statement'}
                      {paymentChannel === 'DEPOSIT' && '📍 Agent deposit to business account'}
                      {paymentChannel === 'MANUAL' && 'Manual recording - specify details below'}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="recipient-account">Which Business Account Received Payment?</Label>
                    <Select value={recipientAccount} onValueChange={setRecipientAccount}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Select business account" />
                      </SelectTrigger>
                      <SelectContent>
                        {mobileMoneyProvider === 'MTN' ? (
                          <>
                            <SelectItem value="0772123456">0772 123 456 (MTN Main) - Primary</SelectItem>
                            <SelectItem value="0777999888">0777 999 888 (MTN Secondary)</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="0755123456">0755 123 456 (Airtel Main) - Primary</SelectItem>
                            <SelectItem value="0750999888">0750 999 888 (Airtel Secondary)</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Select which {mobileMoneyProvider} number received this payment
                    </p>
                  </div>

                  {paymentChannel === 'P2P' && (
                    <div>
                      <Label htmlFor="sender-phone">Customer's Phone Number (Optional)</Label>
                      <Input
                        id="sender-phone"
                        type="tel"
                        value={senderPhone}
                        onChange={(e) => setSenderPhone(e.target.value)}
                        placeholder="e.g., 0772123456 or 256772123456"
                        className="mt-2"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Phone number that sent the money (for P2P tracking)
                      </p>
                    </div>
                  )}
                </>
              )}

              {(paymentMethod === 'MOBILE_MONEY' || paymentMethod === 'BANK_TRANSFER') && (
                <div>
                  <Label htmlFor="transaction-ref">Transaction Reference (Optional)</Label>
                  <Input
                    id="transaction-ref"
                    type="text"
                    value={transactionReference}
                    onChange={(e) => setTransactionReference(e.target.value)}
                    placeholder="e.g., MM12345678 or Bank Ref"
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {paymentMethod === 'MOBILE_MONEY' ? 'Mobile money confirmation code' : 'Bank transfer reference number'}
                  </p>
                </div>
              )}

              {additionalPayment > 0 && (
                <div className="p-4 bg-primary/10 rounded-lg space-y-1">
                  <p className="text-sm font-medium">After this payment:</p>
                  <div className="flex justify-between text-sm">
                    <span>Total Paid:</span>
                    <span>{formatUGX(parseFloat(String(selectedOrder.amount_paid)) + additionalPayment)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Remaining Balance:</span>
                    <span className={parseFloat(String(selectedOrder.total_amount)) - (parseFloat(String(selectedOrder.amount_paid)) + additionalPayment) <= 0 ? 'text-green-600 font-semibold' : ''}>
                      {formatUGX(Math.max(0, parseFloat(String(selectedOrder.total_amount)) - (parseFloat(String(selectedOrder.amount_paid)) + additionalPayment)))}
                    </span>
                  </div>
                  {parseFloat(String(selectedOrder.total_amount)) - (parseFloat(String(selectedOrder.amount_paid)) + additionalPayment) <= 0 && (
                    <p className="text-sm text-green-600 font-semibold pt-2">✓ Order will be fully paid!</p>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowPaymentDialog(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button onClick={handleUpdatePayment} className="w-full sm:w-auto" disabled={additionalPayment <= 0}>
                  Record Payment
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Status Update Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Update Order Status</DialogTitle>
            <DialogDescription>
              Change the processing status for order {selectedOrder?.order_number}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="new-status">Select New Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger id="new-status" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending (Order received)</SelectItem>
                    <SelectItem value="PROCESSING">Processing (Being washed)</SelectItem>
                    <SelectItem value="READY">Ready (Ready for pickup)</SelectItem>
                    <SelectItem value="DELIVERED">Delivered (Customer collected)</SelectItem>
                    {canCancelOrders && (
                      <SelectItem value="CANCELLED">Cancelled (Admin only)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-3 sm:p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Status Flow:</p>
                <div className="flex items-center gap-1 sm:gap-2 text-sm flex-wrap">
                  <Badge variant="secondary">Received</Badge>
                  <span>→</span>
                  <Badge>Processing</Badge>
                  <span>→</span>
                  <Badge variant="outline">Ready</Badge>
                  <span>→</span>
                  <Badge variant="outline">Delivered</Badge>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowStatusDialog(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button onClick={handleUpdateStatus} className="w-full sm:w-auto" disabled={!newStatus || newStatus === selectedOrder.order_status}>
                  Update Status
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Customer Reminder Dialog */}
      <Dialog open={showReminderDialog} onOpenChange={setShowReminderDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-600" />
              Send Reminder to Customer
            </DialogTitle>
            <DialogDescription>
              {reminderOrder && (
                <>
                  Order: <strong>{reminderOrder.order_number}</strong> | Customer: <strong>{reminderOrder.customer_name}</strong>
                  <br />
                  Status: <strong className="capitalize">{reminderOrder.order_status}</strong> | 
                  Payment: <strong>{reminderOrder.payment_status}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {reminderOrder && (
            <div className="space-y-4">
              {/* Context Info */}
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-2">
                  📋 Reminder Context:
                </p>
                <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
                  {reminderOrder.order_status === 'ready' && (
                    <li>• Order is READY for collection</li>
                  )}
                  {reminderOrder.order_status === 'delivered' && reminderOrder.payment_status !== 'PAID' && (
                    <li>• Payment reminder - Outstanding balance</li>
                  )}
                  {reminderOrder.order_status === 'processing' && (
                    <li>• Order is being processed</li>
                  )}
                  {reminderOrder.payment_status !== 'PAID' && (
                    <li>• Balance: UGX {formatUGX(reminderOrder.balance)}</li>
                  )}
                </ul>
              </div>

              {/* Channel Selection */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Send Via</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={reminderChannel === 'both' ? 'default' : 'outline'}
                    onClick={() => setReminderChannel('both')}
                    className="flex-1"
                  >
                    📱 Both (SMS + WhatsApp)
                  </Button>
                  <Button
                    type="button"
                    variant={reminderChannel === 'sms' ? 'default' : 'outline'}
                    onClick={() => setReminderChannel('sms')}
                    className="flex-1"
                  >
                    💬 SMS Only
                  </Button>
                  <Button
                    type="button"
                    variant={reminderChannel === 'whatsapp' ? 'default' : 'outline'}
                    onClick={() => setReminderChannel('whatsapp')}
                    className="flex-1"
                  >
                    <MessageSquare className="h-4 w-4 mr-1" />
                    WhatsApp
                  </Button>
                </div>
              </div>

              {/* Message Preview & Edit */}
              <div>
                <Label htmlFor="reminder-message" className="text-sm font-medium mb-2 block">
                  Message (You can customize before sending)
                </Label>
                <Textarea
                  id="reminder-message"
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                  placeholder="Reminder message..."
                />
                <p className="text-xs text-muted-foreground mt-2">
                  💡 Edit the message above to customize it before sending
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowReminderDialog(false)}
                  className="w-full sm:flex-1"
                  disabled={sendingReminder !== null}
                >
                  Cancel
                </Button>
                {(reminderChannel === 'whatsapp' || reminderChannel === 'both') && reminderOrder && (
                  <Button
                    variant="outline"
                    className="w-full sm:flex-1 border-green-600 text-green-700"
                    disabled={!reminderMessage.trim()}
                    onClick={() => {
                      const opened = openWhatsAppMessenger(
                        reminderOrder.customer_phone,
                        reminderMessage
                      );
                      if (opened) {
                        toast({
                          title: 'Opening WhatsApp Messenger',
                          description: 'Use this when WhatsApp API automation is off.',
                        });
                      }
                    }}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Open Messenger
                  </Button>
                )}
                <Button
                  onClick={sendReminder}
                  disabled={sendingReminder !== null || !reminderMessage.trim()}
                  className="w-full sm:flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {sendingReminder !== null ? (
                    <>
                      <span className="animate-pulse">Sending...</span>
                    </>
                  ) : (
                    <>
                      <Bell className="h-4 w-4 mr-2" />
                      Send via API
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* WhatsApp Messenger compose — edit then open Messenger */}
      <Dialog open={showWhatsAppCompose} onOpenChange={setShowWhatsAppCompose}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[96dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              WhatsApp Messenger
            </DialogTitle>
            <DialogDescription>
              Customize the message, then open WhatsApp to send to the customer from your business account on this device.
            </DialogDescription>
          </DialogHeader>

          {whatsAppComposeOrder && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Order</span>
                  <span className="font-medium">{whatsAppComposeOrder.order_number}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{whatsAppComposeOrder.customer_name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Customer WhatsApp</span>
                  <span className="font-medium">{whatsAppComposePhone || '—'}</span>
                </div>
                {businessPhone && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Business contact</span>
                    <span className="font-medium">{businessPhone}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Message template</Label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['receipt', 'Receipt'],
                      ['ready', 'Order Ready'],
                      ['reminder', 'Reminder'],
                      ['custom', 'Custom'],
                    ] as Array<[WhatsAppComposeKind, string]>
                  ).map(([kind, label]) => (
                    <Button
                      key={kind}
                      type="button"
                      size="sm"
                      variant={whatsAppComposeKind === kind ? 'default' : 'outline'}
                      onClick={() => applyWhatsAppTemplate(kind)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wa-compose-phone">Customer phone</Label>
                <Input
                  id="wa-compose-phone"
                  value={whatsAppComposePhone}
                  onChange={(e) => setWhatsAppComposePhone(e.target.value)}
                  placeholder="07xxxxxxxx or +256..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wa-compose-message">Message (edit freely)</Label>
                <Textarea
                  id="wa-compose-message"
                  value={whatsAppComposeMessage}
                  onChange={(e) => setWhatsAppComposeMessage(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  className="w-full sm:flex-1"
                  onClick={() => setShowWhatsAppCompose(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="w-full sm:flex-1 bg-green-600 hover:bg-green-700"
                  onClick={confirmOpenWhatsAppMessenger}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Open WhatsApp Messenger
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delivery Initiation Dialog */}
      <Dialog open={showDeliveryDialog} onOpenChange={setShowDeliveryDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Initiate Delivery</DialogTitle>
            <DialogDescription>
              Schedule delivery or pickup for order {selectedOrder?.order_number}
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-4 pb-4">
              {/* Order Info */}
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Order:</span>
                  <span className="font-medium">{selectedOrder.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Customer:</span>
                  <span className="font-medium">{selectedOrder.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Phone:</span>
                  <span className="font-medium">{selectedOrder.customer_phone}</span>
                </div>
              </div>
              
              {/* Delivery Type */}
              <div className="space-y-2">
                <Label>Delivery Type *</Label>
                <Select value={deliveryType} onValueChange={(value) => setDeliveryType(value as 'PAID' | 'FREE')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAID">🚚 Deliver to Customer - PAID (Revenue tracked)</SelectItem>
                    <SelectItem value="FREE">🎁 Deliver to Customer - FREE (Offer/Bonus)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {deliveryType === 'PAID' ? '💰 Will track delivery revenue' : '🎉 Free delivery as offer or promotional bonus'}
                </p>
              </div>
              
              {/* Delivery Revenue (only for PAID) */}
              {deliveryType === 'PAID' && (
                <div className="space-y-2">
                  <Label>Delivery Revenue (UGX) *</Label>
                  <Input
                    type="text"
                    placeholder="Enter delivery charge amount"
                    value={formatNumberWithCommas(deliveryRevenue)}
                    onChange={(e) => {
                      const rawValue = parseFormattedNumber(e.target.value);
                      setDeliveryRevenue(rawValue);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Amount customer pays for delivery service
                  </p>
                </div>
              )}
              
              {/* Zone Selection (optional for PAID, can help estimate distance) */}
              {deliveryType === 'PAID' && (
                <>
                  <div className="space-y-2">
                    <Label>Delivery Zone (Optional - for reference)</Label>
                    <Select value={selectedZoneId} onValueChange={setSelectedZoneId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select zone (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {deliveryZones.map((zone) => (
                          <SelectItem key={zone.id} value={zone.id.toString()}>
                            <div className="flex items-center justify-between w-full">
                              <span>{zone.zone_name} ({zone.zone_code})</span>
                              <span className="ml-4 font-medium text-purple-600">
                                {formatUGX(zone.base_delivery_cost)}
                              </span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                ~{zone.estimated_delivery_time_minutes} mins
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedZoneId && (
                      <p className="text-sm text-muted-foreground">
                        ℹ️ Suggested price: {formatUGX(deliveryZones.find(z => z.id === parseInt(selectedZoneId))?.base_delivery_cost)}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Delivery Address *</Label>
                    <Textarea
                      placeholder="Enter specific address, building name, or landmarks..."
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      rows={2}
                    />
                  </div>
                </>
              )}
              
              {/* Offer/Promo Note for FREE deliveries */}
              {deliveryType === 'FREE' && (
                <div className="space-y-2">
                  <Label>Delivery Address *</Label>
                  <Textarea
                    placeholder="Enter delivery address..."
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    rows={2}
                  />
                </div>
              )}
              
              {/* Scheduled Date */}
              <div className="space-y-2">
                <Label htmlFor="delivery-date">Scheduled Date *</Label>
                <input
                  id="delivery-date"
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border rounded-md"
                  aria-label="Select delivery date"
                />
              </div>
              
              {/* Time Slot */}
              <div className="space-y-2">
                <Label>Time Slot</Label>
                <Select value={deliveryTimeSlot} onValueChange={setDeliveryTimeSlot}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MORNING (8AM-12PM)">🌅 Morning (8AM-12PM)</SelectItem>
                    <SelectItem value="AFTERNOON (12PM-4PM)">☀️ Afternoon (12PM-4PM)</SelectItem>
                    <SelectItem value="EVENING (4PM-8PM)">🌆 Evening (4PM-8PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Delivery Person/Rider (Optional) */}
              <div className="space-y-2">
                <Label>Delivery Person / Rider (Optional)</Label>
                <Input
                  placeholder="e.g., John, Mary, Rider name..."
                  value={deliveryPersonName}
                  onChange={(e) => setDeliveryPersonName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter name of person responsible for delivery/pickup
                </p>
              </div>
              
              {/* Vehicle Info (Optional) */}
              <div className="space-y-2">
                <Label>Vehicle Info (Optional)</Label>
                <Input
                  placeholder="e.g., Motorcycle UBD 234K, Van, Bodaboda..."
                  value={vehicleInfo}
                  onChange={(e) => setVehicleInfo(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter vehicle type or registration number
                </p>
              </div>
              
              {/* Delivery Notes */}
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  placeholder="Special instructions for delivery..."
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  rows={2}
                />
              </div>
              
              {/* Summary */}
              <div className="bg-purple-50 dark:bg-purple-950 p-4 rounded-lg space-y-2 border border-purple-200 dark:border-purple-800">
                <p className="font-semibold text-purple-900 dark:text-purple-100">Delivery Summary:</p>
                <div className="text-sm space-y-1 text-purple-800 dark:text-purple-200">
                  <p>• Type: {deliveryType === 'PAID' ? '🚚 Vehicle Delivery (PAID)' : '🎁 Vehicle Delivery (FREE - Offer)'}</p>
                  {deliveryType === 'PAID' && deliveryRevenue && (
                    <p>• Revenue: {formatUGX(deliveryRevenue)}</p>
                  )}
                  {deliveryType === 'FREE' && (
                    <p>• Revenue: FREE (Promotional offer)</p>
                  )}
                  {selectedZoneId && (
                    <p>• Zone: {deliveryZones.find(z => z.id === parseInt(selectedZoneId))?.zone_name}</p>
                  )}
                  <p>• Date: {new Date(deliveryDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <p>• Time: {deliveryTimeSlot}</p>
                  {deliveryPersonName && <p>• Rider: {deliveryPersonName}</p>}
                  {vehicleInfo && <p>• Vehicle: {vehicleInfo}</p>}
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setShowDeliveryDialog(false)} 
                  className="w-full sm:w-auto"
                  disabled={creatingDelivery}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleInitiateDelivery} 
                  className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700"
                  disabled={creatingDelivery || (deliveryType === 'PAID' && !deliveryRevenue)}
                >
                  {creatingDelivery ? 'Creating...' : 'Initiate Delivery'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invoice Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          {invoiceOrderId && token && (
            <Invoice 
              orderId={invoiceOrderId} 
              token={token} 
              onClose={() => {
                setShowInvoiceDialog(false);
                setInvoiceOrderId(null);
              }} 
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel mistaken payment (Admin only) */}
      <Dialog
        open={!!cancelPaymentTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCancelPaymentTarget(null);
            setCancelPaymentReason('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel payment</DialogTitle>
            <DialogDescription>
              Removes this payment from the ledger and recalculates the order
              (UNPAID / PARTIAL / PAID). Use this for mistaken entries — use Refund
              when money was actually returned to the client.
            </DialogDescription>
          </DialogHeader>
          {cancelPaymentTarget && (
            <div className="space-y-3 py-2">
              <p className="text-sm">
                Amount: <strong>{formatUGX(cancelPaymentTarget.amount)}</strong> via{' '}
                {cancelPaymentTarget.payment_method.replace(/_/g, ' ')}
              </p>
              <div className="space-y-2">
                <Label htmlFor="cancel-payment-reason">Reason (optional)</Label>
                <Input
                  id="cancel-payment-reason"
                  value={cancelPaymentReason}
                  onChange={(e) => setCancelPaymentReason(e.target.value)}
                  placeholder="e.g. Marked paid by mistake — client has not paid"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCancelPaymentTarget(null);
                setCancelPaymentReason('');
              }}
            >
              Keep payment
            </Button>
            <Button
              variant="destructive"
              disabled={cancellingPayment}
              onClick={handleCancelPayment}
            >
              {cancellingPayment ? 'Cancelling…' : 'Cancel payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      {selectedOrder && (
        <RefundDialog
          open={showRefundDialog}
          onClose={() => setShowRefundDialog(false)}
          order={{
            id: selectedOrder.id,
            order_number: selectedOrder.order_number,
            customer_name: selectedOrder.customer_name,
            customer_phone: selectedOrder.customer_phone,
            total_amount: selectedOrder.total_amount,
            amount_paid: selectedOrder.amount_paid,
            balance: selectedOrder.balance,
            payment_status: selectedOrder.payment_status,
            status: selectedOrder.order_status,
          }}
          onRefundProcessed={() => {
            fetchOrders();
            setShowDetailsDialog(false);
          }}
        />
      )}
    </MainLayout>
  );
}

import { MainLayout } from '@/components/layout/MainLayout';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { kampalaTodayYmd } from '@/lib/businessDate';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import axios, { AxiosError } from 'axios';
import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  User,
  ShoppingCart,
  Save,
  UserPlus,
  MessageCircle,
  StickyNote,
  Loader2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  buildOrderConfirmationWhatsAppMessage,
  openWhatsAppMessenger,
  DEFAULT_PAYMENT_MODES,
  type PaymentModeDetails,
  type BusinessInfo,
} from '@/lib/whatsapp';

interface Customer {
  id: number;
  customer_id: string;
  name: string;
  phone: string;
  email: string;
  location: string;
  sms_opt_in: boolean;
  customer_type: string;
}

interface PriceItem {
  id: number;
  item_id: string;
  name: string;
  category: string;
  subcategory?: string;
  unit?: string;
  pricing_type?: 'FIXED' | 'PER_KG';
  price_per_kg?: number;
  price: number;
  ironing_price: number;
  express_price?: number | null;
  discount_percentage?: number;
  effective_price?: number;
  effective_ironing_price?: number;
  effective_express_price?: number;
  has_active_discount?: boolean;
}

interface OrderItem {
  price_item_id: number;
  item_name: string;
  service_type: 'WASH' | 'IRON' | 'EXPRESS';
  quantity: number;
  unit_price: number;
  pricing_type?: 'FIXED' | 'PER_KG';
  /** Per-item bargain given to this customer on this line */
  discount_amount?: number;
  /** Quantity used when the current bargain was entered */
  discount_basis_quantity?: number;
  /** Bargain amount at the basis quantity */
  discount_basis_amount?: number;
  /** Whether the line bargain should scale as quantity changes */
  discount_scales_with_quantity?: boolean;
  /** Per-item price-up (surcharge) for stains, special handling, etc. */
  surcharge_amount?: number;
  /** Quantity used when the current price-up was entered */
  surcharge_basis_quantity?: number;
  /** Price-up amount at the basis quantity */
  surcharge_basis_amount?: number;
  /** Net line total: quantity × unit price + surcharge − discount */
  subtotal: number;
  unit?: string;
  /** Internal garment description (colour, brand, marks). Never on receipts. */
  notes?: string;
}

const ITEM_NOTE_MAX = 200;

interface Branch {
  id: number;
  name: string;
  code: string;
  location?: string | null;
  is_active: boolean;
  is_default: boolean;
}

/** Net line total: gross + surcharge − discount, never below zero */
function computeLineSubtotal(quantity: number, unitPrice: number, discount = 0, surcharge = 0): number {
  const gross = Math.round(Number(quantity) * Number(unitPrice));
  return Math.max(0, gross
    + Math.max(0, Math.round(Number(surcharge) || 0))
    - Math.max(0, Math.round(Number(discount) || 0)));
}

function getScaledLineDiscount(
  item: Pick<OrderItem, 'discount_amount' | 'discount_basis_quantity' | 'discount_basis_amount' | 'discount_scales_with_quantity'>,
  quantity: number
): number {
  if (!item.discount_scales_with_quantity) {
    return Math.max(0, Math.round(Number(item.discount_amount || 0)));
  }

  const basisQuantity = Number(item.discount_basis_quantity || 0);
  const basisAmount = Number(item.discount_basis_amount ?? item.discount_amount ?? 0);

  if (basisQuantity > 0 && basisAmount > 0) {
    return Math.max(0, Math.round((basisAmount * Number(quantity)) / basisQuantity));
  }

  return Math.max(0, Math.round(Number(item.discount_amount || 0)));
}

function getScaledLineSurcharge(
  item: Pick<OrderItem, 'surcharge_amount' | 'surcharge_basis_quantity' | 'surcharge_basis_amount'>,
  quantity: number
): number {
  const basisQuantity = Number(item.surcharge_basis_quantity || 0);
  const basisAmount = Number(item.surcharge_basis_amount ?? item.surcharge_amount ?? 0);

  if (basisQuantity > 0 && basisAmount > 0) {
    return Math.max(0, Math.round((basisAmount * Number(quantity)) / basisQuantity));
  }

  return Math.max(0, Math.round(Number(item.surcharge_amount || 0)));
}


// Administrators are uncapped; the order value is the only ceiling
const MAX_DISCOUNT_BY_ROLE: Record<string, number> = {
  DESKTOP_AGENT: 10,
  MANAGER: 20,
  ADMIN: 100,
};

function getApiErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ error?: string; message?: string; errors?: Array<{ msg: string }> }>;
  const data = axiosError.response?.data;

  if (data?.message) return data.message;
  if (data?.error) return data.error;
  if (data?.errors?.length) {
    return data.errors.map((entry) => entry.msg).join(', ');
  }

  return fallback;
}

const BRANCH_PREFERENCE_KEY = 'newOrderBranchId';

export default function NewOrder() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const defaultMaxDiscountPercent = MAX_DISCOUNT_BY_ROLE[user?.role ?? 'DESKTOP_AGENT'] ?? 10;
  const canChooseBranch = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isAdminUser = user?.role === 'ADMIN';
  const canPriceUp = !!user; // All authenticated staff can apply price-up (surcharge)
  const canBackdate = !!user; // All staff can record historical (past-date) orders

  // URA Compliance state
  const [uraComplianceEnabled, setUraComplianceEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(18);
  const [applyVatToOrder, setApplyVatToOrder] = useState(false); // Per-order VAT control
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [paymentModes, setPaymentModes] = useState<PaymentModeDetails>(DEFAULT_PAYMENT_MODES);
  const [openNoteIndexes, setOpenNoteIndexes] = useState<number[]>([]);
  const [useBackdate, setUseBackdate] = useState(false);
  const [orderDate, setOrderDate] = useState(kampalaTodayYmd());
  /** Per-item adjustment mode: 'bargain' = reduce price, 'priceup' = increase price */
  const [itemAdjModes, setItemAdjModes] = useState<Record<number, 'bargain' | 'priceup'>>({});
  const getItemAdjMode = (index: number) => itemAdjModes[index] ?? 'bargain';
  const setItemAdjMode = (index: number, mode: 'bargain' | 'priceup') => {
    setItemAdjModes(prev => ({ ...prev, [index]: mode }));
  };

  // After create: offer WhatsApp Messenger
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [pendingWhatsApp, setPendingWhatsApp] = useState<{
    phone: string;
    customerName: string;
    orderNumber: string;
    message: string;
  } | null>(null);

  // Customer state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerPopover, setShowCustomerPopover] = useState(false);
  const [showAddCustomerDialog, setShowAddCustomerDialog] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);

  // Price items state
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Order state
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [transactionDiscount, setTransactionDiscount] = useState(0);
  const [bargainAmount, setBargainAmount] = useState(0);
  const [orderSurchargeAmount, setOrderSurchargeAmount] = useState(0);
  const [maxBargainAmount, setMaxBargainAmount] = useState(0);
  const [maxItemBargainAmount, setMaxItemBargainAmount] = useState(0);
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(defaultMaxDiscountPercent);
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'UNPAID' | 'PARTIAL'>('UNPAID');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'ON_ACCOUNT'>('ON_ACCOUNT');
  const [mobileProvider, setMobileProvider] = useState<'MTN' | 'AIRTEL'>('MTN');
  const [transactionRef, setTransactionRef] = useState('');
  const [amountPaid, setAmountPaid] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  /** Draft text while typing quantity (index → string) so keyboard entry works smoothly */
  const [quantityDrafts, setQuantityDrafts] = useState<Record<number, string>>({});

  // New customer form
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '',
    phone: '',
    email: '',
    location: '',
    sms_opt_in: true,
    customer_type: 'INDIVIDUAL' as 'INDIVIDUAL' | 'BUSINESS',
  });

  // Fetch customers
  const fetchCustomers = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/customers`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { page: 1, limit: 1000 },
      });
      setCustomers(response.data.customers || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  }, [token]);

  // Fetch price items
  const fetchPriceItems = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/prices`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
          active: 'true',
        },
      });
      setPriceItems(response.data.prices || []);
    } catch (error) {
      console.error('Error fetching price items:', error);
    }
  }, [token, categoryFilter]);

  // Branches: staff are locked to their own, admins/managers may choose
  const fetchBranches = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/branches`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { active: 'true' },
      });
      const list: Branch[] = response.data.branches || [];
      setBranches(list);

      setSelectedBranchId((current) => {
        if (current) return current;
        // Admins/managers keep whichever branch they last served from
        const remembered = canChooseBranch ? localStorage.getItem(BRANCH_PREFERENCE_KEY) : null;
        const sticky = remembered ? list.find((b) => String(b.id) === remembered) : undefined;
        const own = user?.branch_id ? list.find((b) => b.id === user.branch_id) : undefined;
        const fallback = sticky || own || list.find((b) => b.is_default) || list[0];
        return fallback ? String(fallback.id) : '';
      });
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  }, [token, user?.branch_id, canChooseBranch]);

  const handleBranchChange = (value: string) => {
    setSelectedBranchId(value);
    if (canChooseBranch) {
      localStorage.setItem(BRANCH_PREFERENCE_KEY, value);
    }
  };

  // Fetch URA compliance setting
  const fetchURASettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/settings/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const settings = response.data;
      setUraComplianceEnabled(settings.ura_compliance_enabled === 'true' || settings.ura_compliance_enabled === true);
      setVatRate(parseFloat(String(settings.vat_rate ?? 18)) || 18);
      setBusinessPhone(settings.business_phone || '');
      setBusinessInfo({
        name: settings.business_name || 'LUSH DRY CLEANERS & LAUNDROMAT',
        phone: settings.business_phone || '',
        email: settings.business_email || '',
        location: settings.business_location || '',
        address: settings.business_address || '',
      });
      try {
        const accounts = await axios.get(`${API_BASE_URL}/settings/payment-accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setPaymentModes({ ...DEFAULT_PAYMENT_MODES, ...accounts.data });
      } catch {
        setPaymentModes(DEFAULT_PAYMENT_MODES);
      }
    } catch (error) {
      console.error('Error fetching URA settings:', error);
      setUraComplianceEnabled(false);
    }
  }, [token]);

  // Fetch user's bargain limit
  const fetchUserBargainLimit = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMaxBargainAmount(Number(response.data.user.max_bargain_amount) || 0);
      setMaxItemBargainAmount(Number(response.data.user.max_item_bargain_amount) || 0);
      const configuredDiscount = Number(response.data.user.max_discount_percent);
      setMaxDiscountPercent(Number.isFinite(configuredDiscount) && configuredDiscount >= 0
        ? configuredDiscount
        : defaultMaxDiscountPercent);
    } catch (error) {
      console.error('Error fetching user bargain limit:', error);
      setMaxBargainAmount(0);
      setMaxItemBargainAmount(0);
      setMaxDiscountPercent(defaultMaxDiscountPercent);
    }
  }, [defaultMaxDiscountPercent, token]);

  useEffect(() => {
    if (token) {
      fetchCustomers();
      fetchPriceItems();
      fetchURASettings();
      fetchUserBargainLimit();
      fetchBranches();
    }
  }, [token, fetchCustomers, fetchPriceItems, fetchURASettings, fetchUserBargainLimit, fetchBranches]);

  // Filter price items by search
  const filteredPriceItems = priceItems.filter((item) =>
    item.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    item.item_id.toLowerCase().includes(itemSearch.toLowerCase())
  );

  // Add item to order
  const addItemToOrder = (item: PriceItem, serviceType: 'WASH' | 'IRON' | 'EXPRESS') => {
    let unitPrice = 0;
    
    if (serviceType === 'WASH') {
      unitPrice = Number(item.effective_price || item.price);
    } else if (serviceType === 'IRON') {
      unitPrice = Number(item.effective_ironing_price || item.ironing_price);
    } else if (serviceType === 'EXPRESS') {
      // Use effective express price from database (includes custom or automatic pricing)
      unitPrice = Number(item.effective_express_price || (item.effective_price || item.price) * 2);
    }

    if (unitPrice === 0 || isNaN(unitPrice)) {
      toast({
        variant: 'destructive',
        title: 'Service Not Available',
        description: 'This item does not have this service',
      });
      return;
    }

    // Check if item already exists
    const existingIndex = orderItems.findIndex(
      (oi) => oi.price_item_id === item.id && oi.service_type === serviceType
    );

    if (existingIndex >= 0) {
      const updated = [...orderItems];
      const step = item.unit === 'kg' ? 0.5 : 1;
      const nextQty = Number(updated[existingIndex].quantity) + step;
      const nextDiscount = getScaledLineDiscount(updated[existingIndex], nextQty);
      const nextSurcharge = getScaledLineSurcharge(updated[existingIndex], nextQty);
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: nextQty,
        discount_amount: nextDiscount,
        surcharge_amount: nextSurcharge,
        subtotal: computeLineSubtotal(
          nextQty,
          Number(updated[existingIndex].unit_price),
          nextDiscount,
          nextSurcharge
        ),
      };
      setOrderItems(updated);
    } else {
      const startQty = item.unit === 'kg' ? 1 : 1;
      setOrderItems([
        ...orderItems,
        {
          price_item_id: item.id,
          item_name: item.name,
          service_type: serviceType,
          quantity: startQty,
          unit_price: unitPrice,
          discount_amount: 0,
          subtotal: computeLineSubtotal(startQty, unitPrice, 0),
          unit: item.unit || 'piece',
          pricing_type: item.pricing_type,
        },
      ]);
    }

    toast({
      title: '✅ Item Added',
      description: `${item.name} (${serviceType})`,
    });
  };

  // Update quantity (+/− or commit from typed value)
  const updateQuantity = (index: number, newQuantity: number) => {
    const currentItem = orderItems[index];
    if (!currentItem) return;

    const isKg = currentItem.unit === 'kg';
    const minimumQuantity = isKg ? 0.1 : 1;
    let normalizedQuantity = Number(newQuantity);

    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity < minimumQuantity) {
      normalizedQuantity = minimumQuantity;
    }

    // Pieces: whole numbers. Kg: keep up to 2 decimals (type any weight; +/− uses 0.5)
    normalizedQuantity = isKg
      ? Math.round(normalizedQuantity * 100) / 100
      : Math.max(1, Math.round(normalizedQuantity));

    const updated = [...orderItems];
    const nextDiscount = getScaledLineDiscount(updated[index], normalizedQuantity);
    const nextSurcharge = getScaledLineSurcharge(updated[index], normalizedQuantity);
    updated[index] = {
      ...updated[index],
      quantity: normalizedQuantity,
      discount_amount: nextDiscount,
      surcharge_amount: nextSurcharge,
      subtotal: computeLineSubtotal(
        normalizedQuantity,
        Number(updated[index].unit_price),
        nextDiscount,
        nextSurcharge
      ),
    };
    setOrderItems(updated);
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const adjustQuantity = (index: number, delta: number) => {
    const current = orderItems[index];
    if (!current) return;
    updateQuantity(index, Number(current.quantity) + delta);
  };

  const handleQuantityInputChange = (index: number, raw: string) => {
    // Allow empty / intermediate typing like "2." or "0."
    setQuantityDrafts((prev) => ({ ...prev, [index]: raw }));
    if (raw.trim() === '' || raw === '.' || raw.endsWith('.')) return;
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    const currentItem = orderItems[index];
    if (!currentItem) return;
    const isKg = currentItem.unit === 'kg';
    const minimumQuantity = isKg ? 0.1 : 1;
    if (parsed < minimumQuantity) return;

    const quantity = isKg ? Math.round(parsed * 100) / 100 : Math.round(parsed);
    const updated = [...orderItems];
    const nextDiscount = getScaledLineDiscount(updated[index], quantity);
    const nextSurcharge = getScaledLineSurcharge(updated[index], quantity);
    updated[index] = {
      ...updated[index],
      quantity,
      discount_amount: nextDiscount,
      surcharge_amount: nextSurcharge,
      subtotal: computeLineSubtotal(
        quantity,
        Number(updated[index].unit_price),
        nextDiscount,
        nextSurcharge
      ),
    };
    setOrderItems(updated);
  };

  /** Per-item bargain, capped at the line's gross value and the role's discount limit */
  const updateItemDiscount = (index: number, rawValue: string) => {
    const current = orderItems[index];
    if (!current) return;

    const gross = Math.round(Number(current.quantity) * Number(current.unit_price));
    const roleCeiling = Math.round(gross * (maxDiscountPercent / 100));
    const configuredCeiling = maxItemBargainAmount > 0 ? maxItemBargainAmount : roleCeiling;
    const parsed = Math.max(0, Math.round(Number(rawValue) || 0));
    const discount = Math.min(parsed * Number(current.quantity), configuredCeiling, gross);

    if (parsed * Number(current.quantity) > configuredCeiling) {
      toast({
        variant: 'destructive',
        title: 'Discount limit reached',
        description: maxItemBargainAmount > 0
          ? `Your configured per-item limit is ${formatUGX(maxItemBargainAmount)} per line.`
          : `Your role allows up to ${maxDiscountPercent}% on this line (${formatUGX(roleCeiling)} here).`,
      });
    }

    const updated = [...orderItems];
    updated[index] = {
      ...updated[index],
      discount_amount: discount,
      discount_basis_quantity: current.quantity,
      discount_basis_amount: discount,
      discount_scales_with_quantity: true,
      subtotal: computeLineSubtotal(current.quantity, current.unit_price, discount, current.surcharge_amount || 0),
    };
    setOrderItems(updated);
  };

  /** Per-item price-up (surcharge) — admin/manager only */
  const updateItemSurcharge = (index: number, rawValue: string) => {
    const current = orderItems[index];
    if (!current) return;
    const parsed = Math.max(0, Math.round(Number(rawValue) || 0));
    const totalSurcharge = Math.round(parsed * Number(current.quantity));
    const updated = [...orderItems];
    updated[index] = {
      ...updated[index],
      surcharge_amount: totalSurcharge,
      surcharge_basis_quantity: current.quantity,
      surcharge_basis_amount: totalSurcharge,
      subtotal: computeLineSubtotal(
        current.quantity,
        current.unit_price,
        current.discount_amount || 0,
        totalSurcharge
      ),
    };
    setOrderItems(updated);
  };

  /** Staff-only garment description so the item can be found on the rack */
  const updateItemNote = (index: number, value: string) => {
    const updated = [...orderItems];
    updated[index] = { ...updated[index], notes: value.slice(0, ITEM_NOTE_MAX) };
    setOrderItems(updated);
  };

  const toggleItemNote = (index: number) => {
    setOpenNoteIndexes((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const commitQuantityDraft = (index: number) => {
    const draft = quantityDrafts[index];
    const currentItem = orderItems[index];
    if (!currentItem) return;
    if (draft === undefined) return;
    const parsed = parseFloat(draft);
    updateQuantity(index, Number.isFinite(parsed) ? parsed : currentItem.quantity);
  };

  // Remove item
  const removeItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
    setQuantityDrafts({});
    // Positions shift after a removal, so drop the open-note tracking
    setOpenNoteIndexes([]);
    toast({
      title: 'Item Removed',
      description: 'Item removed from order',
    });
  };

  // Calculate totals. VAT only exists while URA compliance is switched on;
  // the backend enforces the same rule and recomputes the amount itself.
  const vatApplies = uraComplianceEnabled && (applyVatToOrder || uraComplianceEnabled);
  const VAT_RATE = vatApplies ? vatRate : 0;
  const itemsSubtotal = Math.round(orderItems.reduce((sum, item) => sum + Number(item.subtotal), 0));
  const itemDiscountTotal = Math.round(
    orderItems.reduce((sum, item) => sum + Number(item.discount_amount || 0), 0)
  );
  const itemSurchargeTotal = Math.round(
    orderItems.reduce((sum, item) => sum + Number(item.surcharge_amount || 0), 0)
  );
  const discountAmount = Math.round((itemsSubtotal * transactionDiscount) / 100);
  const bargainLimitRemaining = Math.max(0, maxBargainAmount - itemDiscountTotal);
  const safeBargain = Math.min(
    Math.max(0, Math.round(bargainAmount)),
    Math.max(0, itemsSubtotal - discountAmount),
    bargainLimitRemaining
  );
  const safeOrderSurcharge = Math.max(0, Math.round(orderSurchargeAmount));
  const subtotalAfterDiscount = Math.max(0, itemsSubtotal - discountAmount - safeBargain + safeOrderSurcharge);
  const taxAmount = vatApplies ? Math.round((subtotalAfterDiscount * VAT_RATE) / 100) : 0;
  const total = subtotalAfterDiscount + taxAmount;
  const balance = Math.max(0, total - amountPaid);
  
  // For backward compatibility
  const subtotal = itemsSubtotal;

  // Auto-update payment status based on amount paid and method
  useEffect(() => {
    if (paymentMethod === 'ON_ACCOUNT') {
      // ON_ACCOUNT always = UNPAID, zero amount
      setPaymentStatus('UNPAID');
      if (amountPaid !== 0) setAmountPaid(0);
      return;
    }
    // For cash/mm/bt: derive status from amount
    if (amountPaid === 0) {
      // No amount entered yet with a real payment method — stay UNPAID momentarily
      // but don't force-switch back to ON_ACCOUNT here (let user finish typing)
      setPaymentStatus('UNPAID');
    } else if (amountPaid >= total && total > 0) {
      setPaymentStatus('PAID');
    } else {
      setPaymentStatus('PARTIAL');
    }
  }, [amountPaid, total, paymentMethod]);

  /**
   * When user types an amount > 0 while ON_ACCOUNT is selected,
   * automatically switch to CASH so they don't have to manually change the method.
   */
  const handleAmountPaidChange = (raw: number) => {
    const value = total > 0 ? Math.min(raw, total) : raw;
    if (value > 0 && paymentMethod === 'ON_ACCOUNT') {
      setPaymentMethod('CASH');
    }
    setAmountPaid(value);
  };

  // Handle quick add customer
  const handleQuickAddCustomer = async () => {
    if (!newCustomerForm.name || !newCustomerForm.phone) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Name and phone are required',
      });
      return;
    }

    if (addingCustomer) {
      return;
    }

    try {
      setAddingCustomer(true);
      const response = await axios.post(
        `${API_BASE_URL}/customers`,
        newCustomerForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const newCustomer = response.data.customer;
      await fetchCustomers(); // Refresh customer list
      setSelectedCustomer(newCustomer);
      setShowAddCustomerDialog(false);
      setNewCustomerForm({
        name: '',
        phone: '',
        email: '',
        location: '',
        sms_opt_in: true,
        customer_type: 'INDIVIDUAL',
      });

      toast({
        title: '✅ Customer Added',
        description: `${newCustomer.name} has been added to the system`,
      });
    } catch (error) {
      const axiosError = error as AxiosError<{
        error?: string;
        message?: string;
        existingCustomer?: Customer;
      }>;
      const existingCustomer = axiosError.response?.data?.existingCustomer;

      if (axiosError.response?.status === 409 && axiosError.response?.data?.error === 'DUPLICATE_PHONE' && existingCustomer) {
        setSelectedCustomer(existingCustomer);
        setShowAddCustomerDialog(false);
        setNewCustomerForm({
          name: '',
          phone: '',
          email: '',
          location: '',
          sms_opt_in: true,
          customer_type: 'INDIVIDUAL',
        });

        toast({
          title: 'Customer already exists',
          description: `${existingCustomer.name} is already registered. We selected the existing customer record instead.`,
        });
        return;
      }

      toast({
        variant: 'destructive',
        title: 'Error',
        description: getApiErrorMessage(error, 'Failed to add customer'),
      });
    } finally {
      setAddingCustomer(false);
    }
  };

  // Handle create order
  const resetOrderForm = () => {
    setSelectedCustomer(null);
    setOrderItems([]);
    setQuantityDrafts({});
    setItemAdjModes({});
    setTransactionDiscount(0);
    setBargainAmount(0);
    setOrderSurchargeAmount(0);
    setApplyVatToOrder(false);
    setPaymentStatus('UNPAID');
    setPaymentMethod('ON_ACCOUNT');
    setTransactionRef('');
    setAmountPaid(0);
    setNotes('');
    setItemSearch('');
    setUseBackdate(false);
    setOrderDate(kampalaTodayYmd());
  };

  const sendOrderViaWhatsApp = (phone: string, message: string) => {
    const opened = openWhatsAppMessenger(phone, message);
    if (opened) {
      toast({
        title: 'Opening WhatsApp Messenger',
        description: 'Review the message, then tap Send on your phone.',
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'WhatsApp unavailable',
        description: 'Customer phone number is missing or invalid.',
      });
    }
    return opened;
  };

  const handleCreateOrder = async () => {
    if (!selectedCustomer) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please select a customer',
      });
      return;
    }

    if (orderItems.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please add items to the order',
      });
      return;
    }

    try {
      const requestedBargain = Math.max(0, Math.round(bargainAmount));
      if (!isAdminUser && itemDiscountTotal > maxBargainAmount) {
        toast({
          variant: 'destructive',
          title: 'Bargain limit exceeded',
          description: `Item bargains total ${formatUGX(itemDiscountTotal)}, which exceeds your limit of ${formatUGX(maxBargainAmount)}.`,
        });
        return;
      }

      if (!isAdminUser && requestedBargain > bargainLimitRemaining) {
        toast({
          variant: 'destructive',
          title: 'Bargain limit exceeded',
          description: `You have ${formatUGX(bargainLimitRemaining)} left after item bargains.`,
        });
        return;
      }

      setLoading(true);

      const orderData = {
        customer_id: selectedCustomer.id,
        items: orderItems,
        subtotal: subtotalAfterDiscount,
        tax_rate: VAT_RATE,
        tax_amount: taxAmount,
        discount_percentage: transactionDiscount,
        discount_amount: discountAmount,
        bargain_amount: safeBargain,
        surcharge_amount: safeOrderSurcharge,
        total_amount: total,
        payment_status: paymentStatus,
        payment_method: paymentMethod === 'MOBILE_MONEY' ? `${paymentMethod}_${mobileProvider}` : paymentMethod,
        amount_paid: Math.min(amountPaid, total),
        transaction_reference: transactionRef || null,
        notes,
        branch_id: selectedBranchId ? Number(selectedBranchId) : undefined,
        ...(canBackdate && useBackdate ? { order_date: orderDate, payment_date: orderDate } : {}),
      };

      const response = await axios.post(`${API_BASE_URL}/orders`, orderData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const order = response.data.order;
      const customerSnapshot = selectedCustomer;
      const itemsSnapshot = [...orderItems];

      toast({
        title: 'Order Created Successfully',
        description: `Order ${order.order_number} created for ${customerSnapshot.name}`,
      });

      const message = buildOrderConfirmationWhatsAppMessage(
        {
          order_number: order.order_number,
          customer_name: customerSnapshot.name,
          created_at: order.created_at || new Date().toISOString(),
          subtotal: Number(order.subtotal ?? subtotalAfterDiscount),
          discount_percentage: Number(order.discount_percentage ?? transactionDiscount),
          discount_amount: Number(order.discount_amount ?? discountAmount),
          bargain_amount: Number(order.bargain_amount ?? bargainAmount),
          surcharge_amount: Number(order.surcharge_amount ?? safeOrderSurcharge),
          tax_rate: Number(order.tax_rate ?? VAT_RATE),
          tax_amount: Number(order.tax_amount ?? taxAmount),
          total_amount: Number(order.total_amount ?? total),
          amount_paid: Number(order.amount_paid ?? Math.min(amountPaid, total)),
          balance: Number(order.balance ?? Math.max(0, total - Math.min(amountPaid, total))),
          payment_status: order.payment_status || paymentStatus,
          payment_method: order.payment_method || orderData.payment_method,
          order_status: order.order_status || 'pending',
          // Only name the branch on receipts when the business actually has more than one
          branch_name:
            branches.length > 1
              ? order.branch_name || branches.find((b) => String(b.id) === selectedBranchId)?.name
              : undefined,
        },
        itemsSnapshot.map((item) => ({
          item_name: item.item_name,
          service_type: item.service_type,
          quantity: item.quantity,
          total_price: item.subtotal,
          discount_amount: item.discount_amount,
          surcharge_amount: item.surcharge_amount,
        })),
        businessInfo || (businessPhone ? { phone: businessPhone } : null),
        paymentModes
      );

      resetOrderForm();

      if (customerSnapshot.phone) {
        setPendingWhatsApp({
          phone: customerSnapshot.phone,
          customerName: customerSnapshot.name,
          orderNumber: order.order_number,
          message,
        });
        setWhatsappDialogOpen(true);
        // Open WhatsApp Messenger immediately so staff can send from their phone
        sendOrderViaWhatsApp(customerSnapshot.phone, message);
      } else {
        toast({
          variant: 'destructive',
          title: 'No customer phone',
          description: 'Order saved, but WhatsApp needs a phone number on the customer profile.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error Creating Order',
        description: getApiErrorMessage(error, 'Failed to create order'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout title="New Order" subtitle="POS - Create customer orders">
      {/* Full-height POS layout - scrollable on mobile, fixed on desktop */}
      <div className="lg:h-[calc(100vh-120px)] flex flex-col gap-3 lg:overflow-hidden">
        
        {/* Top Bar: Customer Selection (compact) */}
        <div className="flex items-center gap-2 md:gap-3 bg-card border rounded-lg px-2 md:px-4 py-2 shrink-0 flex-wrap sm:flex-nowrap">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <Popover open={showCustomerPopover} onOpenChange={setShowCustomerPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between h-9"
                  size="sm"
                >
                  {selectedCustomer ? (
                    <span className="flex items-center gap-2 truncate">
                      <span className="font-semibold truncate">{selectedCustomer.name}</span>
                      <span className="text-muted-foreground text-xs hidden sm:inline">📞 {selectedCustomer.phone}</span>
                      {selectedCustomer.location && <span className="text-muted-foreground text-xs hidden md:inline">📍 {selectedCustomer.location}</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Search customer by name, phone, or ID...</span>
                  )}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[400px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search customers..."
                    value={customerSearch}
                    onValueChange={setCustomerSearch}
                  />
                  <CommandEmpty>No customer found.</CommandEmpty>
                  <CommandGroup className="max-h-64 overflow-auto">
                    {customers
                      .filter(
                        (c) =>
                          c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                          c.customer_id.toLowerCase().includes(customerSearch.toLowerCase()) ||
                          c.phone.includes(customerSearch)
                      )
                      .map((customer) => (
                        <CommandItem
                          key={customer.id}
                          value={`${customer.id}-${customer.name}-${customer.phone}`}
                          onSelect={() => {
                            setSelectedCustomer(customer);
                            setShowCustomerPopover(false);
                            setCustomerSearch('');
                          }}
                        >
                          <div className="flex flex-col w-full">
                            <span className="font-medium">{customer.name}</span>
                            <span className="text-sm text-muted-foreground">
                              📞 {customer.phone} • ID: {customer.customer_id}
                            </span>
                            {customer.location && (
                              <span className="text-xs text-muted-foreground">📍 {customer.location}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          {selectedCustomer && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
              title="Clear customer"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddCustomerDialog(true)}
            className="shrink-0"
          >
            <UserPlus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">New</span>
          </Button>
          {/* Branch is only surfaced once a second branch exists */}
          {branches.length > 1 && (
            canChooseBranch ? (
              <Select value={selectedBranchId} onValueChange={handleBranchChange}>
                <SelectTrigger className="h-9 w-full sm:w-[140px] lg:w-[190px] shrink-0">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id)}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className="shrink-0 max-w-[120px] truncate">
                {branches.find((b) => String(b.id) === selectedBranchId)?.name || 'Branch'}
              </Badge>
            )
          )}
          {/* URA/VAT indicator */}
          {(uraComplianceEnabled || applyVatToOrder) && (
            <Badge variant="secondary" className="shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              VAT 18%
            </Badge>
          )}
        </div>

        {/* Main POS split: Left = Cart/Payment, Right = Item Catalog */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-3 lg:min-h-0">
          
          {/* ===== LEFT PANEL: Cart + Payment (2/5 width) =====
               On phones the catalog is shown first, so items can be picked
               before the cart and payment section come into view. */}
          <div className="order-2 lg:order-1 lg:col-span-2 flex flex-col gap-3 overflow-y-auto">
            
            {/* Cart Items */}
            <div className="bg-card border rounded-lg">
              <div className="px-4 py-2 border-b flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2 text-sm">
                  <ShoppingCart className="h-4 w-4" />
                  Cart ({orderItems.length} items)
                </h3>
                <span className="text-xs text-muted-foreground">
                  {orderItems.length === 0
                    ? 'No items'
                    : orderItems.reduce((sum, i) => sum + i.quantity, 0).toFixed(1).replace(/\.0$/, '') + ' units'}
                </span>
              </div>
              
              <div className="p-2 space-y-1">
                {orderItems.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                    <div className="text-center">
                      <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p>Select items from the catalog →</p>
                    </div>
                  </div>
                ) : (
                  orderItems.map((item, index) => (
                    <div key={index} className="space-y-1.5 p-2 bg-muted/50 rounded-md group hover:bg-muted transition-colors">
                      {/* Name and line total share the full panel width so the
                          name is never squeezed by the controls below it */}
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.item_name}</p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                              {item.service_type}
                            </Badge>
                            <span className="whitespace-nowrap">
                              {formatUGX(item.unit_price)} / {item.unit || 'piece'}
                            </span>
                          </div>
                        </div>
                        <span className="font-semibold text-sm text-right shrink-0 leading-tight">
                          {formatUGX(item.subtotal)}
                          {Number(item.discount_amount) > 0 && (
                            <span className="block text-[10px] font-normal text-muted-foreground line-through">
                              {formatUGX(
                                Math.round(Number(item.quantity) * Number(item.unit_price))
                              )}
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 lg:h-7 lg:w-7"
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => adjustQuantity(index, item.unit === 'kg' ? -0.5 : -1)}
                        >
                          <Minus className="h-4 w-4 lg:h-3 lg:w-3" />
                        </Button>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={item.unit === 'kg' ? 0.1 : 1}
                          step={item.unit === 'kg' ? 0.1 : 1}
                          value={
                            quantityDrafts[index] !== undefined
                              ? quantityDrafts[index]
                              : String(item.quantity)
                          }
                          onChange={(e) => handleQuantityInputChange(index, e.target.value)}
                          onFocus={(e) => {
                            setQuantityDrafts((prev) => ({
                              ...prev,
                              [index]: String(item.quantity),
                            }));
                            e.target.select();
                          }}
                          onBlur={() => commitQuantityDraft(index)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="h-9 lg:h-7 w-[4.5rem] text-center text-sm font-bold px-1"
                          title={item.unit === 'kg' ? 'Enter weight in kg (e.g. 2.5)' : 'Type quantity, or use + / −'}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 lg:h-7 lg:w-7"
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => adjustQuantity(index, item.unit === 'kg' ? 0.5 : 1)}
                        >
                          <Plus className="h-4 w-4 lg:h-3 lg:w-3" />
                        </Button>

                        {/* Push the row actions away from the quantity stepper */}
                        <div className="flex-1" />

                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn(
                            'h-9 w-9 lg:h-7 lg:w-7',
                            item.notes?.trim()
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          )}
                          type="button"
                          aria-label={
                            item.notes?.trim()
                              ? `Edit description for ${item.item_name}`
                              : `Add description for ${item.item_name}`
                          }
                          title="Describe this item (colour, brand, marks) — staff only"
                          onClick={() => toggleItemNote(index)}
                        >
                          <StickyNote className="h-4 w-4 lg:h-3 lg:w-3" />
                        </Button>
                        {/* Stays visible on touch devices, which have no hover */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 lg:h-7 lg:w-7 text-destructive lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                          type="button"
                          aria-label="Remove item"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4 lg:h-3 lg:w-3" />
                        </Button>
                      </div>

                      {/* Adjustment row: toggle between Bargain (deduct) and Price Up (add) */}
                      <div className="flex items-center gap-2">
                        {canPriceUp ? (
                          /* Admin/Manager: toggle between bargain and price-up */
                          <div className="flex rounded-md border overflow-hidden shrink-0 h-9 lg:h-7">
                            <button
                              type="button"
                              onClick={() => setItemAdjMode(index, 'bargain')}
                              className={`px-2 text-[10px] font-semibold transition-colors ${
                                getItemAdjMode(index) === 'bargain'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-background text-muted-foreground hover:bg-muted'
                              }`}
                              title="Apply a bargain (reduce price)"
                            >
                              ▼ Bargain
                            </button>
                            <button
                              type="button"
                              onClick={() => setItemAdjMode(index, 'priceup')}
                              className={`px-2 text-[10px] font-semibold transition-colors border-l ${
                                getItemAdjMode(index) === 'priceup'
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-background text-muted-foreground hover:bg-muted'
                              }`}
                              title="Apply a price up (stains, special treatment)"
                            >
                              ▲ Price Up
                            </button>
                          </div>
                        ) : (
                          <Label className="text-[11px] text-muted-foreground whitespace-nowrap">
                            Bargain (UGX)
                          </Label>
                        )}
                        <Input
                          id={canPriceUp ? `item-adj-${index}` : `item-discount-${index}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={500}
                          value={
                            canPriceUp
                              ? getItemAdjMode(index) === 'bargain'
                                ? (item.discount_amount ? String(Math.round(Number(item.discount_amount) / Number(item.quantity))) : '')
                                : (item.surcharge_amount ? String(Math.round(Number(item.surcharge_amount) / Number(item.quantity))) : '')
                              : (item.discount_amount ? String(Math.round(Number(item.discount_amount) / Number(item.quantity))) : '')
                          }
                          placeholder="0"
                          onChange={(e) => {
                            if (canPriceUp && getItemAdjMode(index) === 'priceup') {
                              updateItemSurcharge(index, e.target.value);
                            } else {
                              updateItemDiscount(index, e.target.value);
                            }
                          }}
                          className={`h-9 lg:h-7 flex-1 text-right text-xs ${
                            canPriceUp && getItemAdjMode(index) === 'priceup'
                              ? 'border-amber-400 focus-visible:ring-amber-400'
                              : ''
                          }`}
                          title={
                            canPriceUp && getItemAdjMode(index) === 'priceup'
                              ? 'Price-up per unit for stains or special treatment; multiplies with quantity.'
                                : `Bargain per unit; multiplies with quantity. Limit: ${maxItemBargainAmount > 0 ? formatUGX(maxItemBargainAmount) : `${maxDiscountPercent}%`}`
                          }
                        />
                        {/* Show the sign badge when amount > 0 */}
                        {canPriceUp && getItemAdjMode(index) === 'priceup' && Number(item.surcharge_amount || 0) > 0 && (
                          <span className="text-[10px] font-bold text-amber-600 shrink-0">+{formatUGX(item.surcharge_amount!)} total</span>
                        )}
                        {(getItemAdjMode(index) === 'bargain' || !canPriceUp) && Number(item.discount_amount || 0) > 0 && (
                          <span className="text-[10px] font-bold text-primary shrink-0">-{formatUGX(item.discount_amount!)} total</span>
                        )}
                      </div>

                      {/* Garment description: opened on demand, or kept open
                          while it holds text so it is never lost from view */}
                      {(openNoteIndexes.includes(index) || Boolean(item.notes?.trim())) && (
                        <div className="space-y-1">
                          <Input
                            id={`item-note-${index}`}
                            value={item.notes || ''}
                            maxLength={ITEM_NOTE_MAX}
                            placeholder="e.g. Navy blue Gucci shirt, ink stain on left cuff"
                            onChange={(e) => updateItemNote(index, e.target.value)}
                            className="h-10 lg:h-8 text-xs"
                            autoFocus={openNoteIndexes.includes(index) && !item.notes}
                          />
                          <div className="flex items-start justify-between gap-2 text-[10px] text-muted-foreground">
                            <span className="min-w-0">Staff only — not shown to the customer.</span>
                            <span className="shrink-0 tabular-nums">
                              {(item.notes || '').length}/{ITEM_NOTE_MAX}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Totals + Payment + Actions */}
            <div className="bg-card border rounded-lg p-3 space-y-2">
              {/* Quick totals */}
              <div className="space-y-1 text-sm">
                {itemDiscountTotal > 0 && (
                  <div className="flex justify-between text-primary">
                    <span>Item bargains</span>
                    <span>-{formatUGX(itemDiscountTotal)}</span>
                  </div>
                )}
                {itemSurchargeTotal > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Item price-ups</span>
                    <span>+{formatUGX(itemSurchargeTotal)}</span>
                  </div>
                )}
                {!isAdminUser && (
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Bargain budget left</span>
                    <span>{formatUGX(bargainLimitRemaining)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatUGX(itemsSubtotal)}</span>
                </div>
                {transactionDiscount > 0 && (
                  <div className="flex justify-between text-primary">
                    <span>Discount ({transactionDiscount}%)</span>
                    <span>-{formatUGX(discountAmount)}</span>
                  </div>
                )}
                {safeBargain > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Bargain</span>
                    <span>-{formatUGX(safeBargain)}</span>
                  </div>
                )}
                {safeOrderSurcharge > 0 && (
                  <div className="flex justify-between text-amber-600 font-medium">
                    <span>Price up</span>
                    <span>+{formatUGX(safeOrderSurcharge)}</span>
                  </div>
                )}
                {(uraComplianceEnabled || applyVatToOrder) && taxAmount > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>VAT ({VAT_RATE}%)</span>
                    <span>+{formatUGX(taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-1 border-t">
                  <span>Total</span>
                  <span>{formatUGX(total)}</span>
                </div>
              </div>

              {/* Money controls: two across on phones so the "(max …)" hints
                  stay on one or two lines instead of stacking three deep */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Discount % <span className="text-muted-foreground/70">(max {maxDiscountPercent}%)</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max={maxDiscountPercent}
                    value={transactionDiscount || ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      if (value <= maxDiscountPercent) {
                        setTransactionDiscount(value);
                      } else {
                        toast({
                          variant: 'destructive',
                          title: 'Discount Limit',
                          description: `Your role allows up to ${maxDiscountPercent}% discount`,
                        });
                      }
                    }}
                    placeholder="0"
                    className="h-10 lg:h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Bargain {isAdminUser ? (
                      <span className="text-muted-foreground/70">(no limit)</span>
                    ) : maxBargainAmount > 0 ? (
                      <span className="text-muted-foreground/70">(max {formatUGX(maxBargainAmount)})</span>
                    ) : null}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max={isAdminUser ? undefined : bargainLimitRemaining}
                    value={bargainAmount || ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      if (isAdminUser || value <= bargainLimitRemaining) {
                        setBargainAmount(value);
                      } else {
                        toast({
                          variant: 'destructive',
                          title: 'Bargain Limit',
                          description: `You have ${formatUGX(bargainLimitRemaining)} left after item bargains.`,
                        });
                      }
                    }}
                    placeholder="0"
                    className="h-10 lg:h-8 text-sm mt-1"
                    disabled={!isAdminUser && bargainLimitRemaining === 0}
                  />
                </div>

                {canPriceUp && (
                  <div>
                    <Label className="text-xs text-amber-600 font-medium">
                      Price Up <span className="text-muted-foreground/70 font-normal">(surcharge)</span>
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={orderSurchargeAmount || ''}
                      onChange={(e) => setOrderSurchargeAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="0"
                      className="h-10 lg:h-8 text-sm mt-1 border-amber-300 focus-visible:ring-amber-400"
                      title="Add an order-level surcharge (e.g. stain treatment fee)"
                    />
                  </div>
                )}
                <div className="col-span-2 lg:col-span-1">
                  <Label className="text-xs text-muted-foreground">Amount Paid</Label>
                  <Input
                    type="number"
                    min="0"
                    value={amountPaid || ''}
                    onChange={(e) => handleAmountPaidChange(parseFloat(e.target.value) || 0)}
                    placeholder="Enter amount…"
                    className={cn('h-10 lg:h-8 text-sm mt-1', paymentMethod === 'ON_ACCOUNT' && 'opacity-40')}
                    disabled={paymentMethod === 'ON_ACCOUNT'}
                  />
                  {paymentMethod === 'ON_ACCOUNT' && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">Deferred — customer pays on collection</p>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <strong className="text-foreground">Bargain rule:</strong> if you enter a bargain while the line is still at quantity 1, the discount follows the line as quantity increases. If you enter the bargain after the line has already been summed up, the discount stays fixed for that line.
              </div>

              {/* ── Payment Method ───────────────────────────────────────── */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-medium">Payment Method</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { value: 'ON_ACCOUNT', label: 'On Account', emoji: '📋', desc: 'Pay later' },
                      { value: 'CASH',       label: 'Cash',       emoji: '💵', desc: 'At counter' },
                      { value: 'MOBILE_MONEY', label: 'Mobile Money', emoji: '📱', desc: 'MTN/Airtel' },
                      { value: 'BANK_TRANSFER', label: 'Bank Transfer', emoji: '🏦', desc: 'Wire / EFT' },
                    ] as const
                  ).map(({ value, label, emoji, desc }) => {
                    const isSelected = paymentMethod === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(value);
                          if (value === 'ON_ACCOUNT') {
                            setAmountPaid(0);
                            setPaymentStatus('UNPAID');
                          } else if (amountPaid === 0) {
                            // Switching to a real method but no amount yet — keep as UNPAID
                            // until user types the amount
                          }
                        }}
                        className={cn(
                          'flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2.5 text-center transition-all select-none',
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary shadow-sm font-semibold'
                            : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
                        )}
                      >
                        <span className="text-lg leading-none">{emoji}</span>
                        <span className="text-xs font-medium leading-tight">{label}</span>
                        <span className="text-[10px] leading-tight opacity-60">{desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mobile money provider + ref */}
              {paymentMethod === 'MOBILE_MONEY' && (
                <div className="grid grid-cols-2 gap-2">
                  <Select value={mobileProvider} onValueChange={(v: 'MTN' | 'AIRTEL') => setMobileProvider(v)}>
                    <SelectTrigger className="h-10 lg:h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MTN">MTN MoMo</SelectItem>
                      <SelectItem value="AIRTEL">Airtel Money</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="Transaction Ref"
                    className="h-10 lg:h-8 text-sm"
                  />
                </div>
              )}

              {/* Bank transfer ref */}
              {paymentMethod === 'BANK_TRANSFER' && (
                <Input
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="Bank Reference #"
                  className="h-10 lg:h-8 text-sm"
                />
              )}

              {/* Payment status — auto-derived; manual override allowed for cash/mm/bt */}
              {paymentMethod !== 'ON_ACCOUNT' && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground shrink-0">Status:</Label>
                  <div className="flex gap-1.5">
                    {(
                      [
                        { value: 'PAID',    label: '✅ Paid (full)', color: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300' },
                        { value: 'PARTIAL', label: '⚠️ Partial',     color: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300' },
                      ] as const
                    ).map(({ value, label, color }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setPaymentStatus(value);
                          if (value === 'PAID' && total > 0) setAmountPaid(total);
                        }}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all',
                          paymentStatus === value
                            ? color + ' shadow-sm'
                            : 'border-border text-muted-foreground hover:border-primary/40'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                    {/* Show current status if it doesn't match a button — e.g. UNPAID with amount 0 */}
                    {paymentStatus === 'UNPAID' && (
                      <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        ⏳ Unpaid (enter amount above)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* On Account status indicator */}
              {paymentMethod === 'ON_ACCOUNT' && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-2">
                  <span className="text-sm">📋</span>
                  <div className="text-xs text-blue-800 dark:text-blue-300">
                    <span className="font-semibold">On Account</span> — order recorded as <span className="font-semibold">unpaid</span>. Customer settles on collection or at a later date.
                  </div>
                </div>
              )}

              {/* VAT + Notes row. VAT is unavailable until URA compliance is switched on. */}
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex items-center gap-2 shrink-0',
                    !uraComplianceEnabled && 'opacity-40'
                  )}
                  title={
                    uraComplianceEnabled
                      ? 'URA compliance is on — VAT is applied automatically'
                      : 'Switch on URA compliance in Settings to charge VAT'
                  }
                >
                  <Checkbox
                    id="vat-toggle"
                    checked={uraComplianceEnabled && applyVatToOrder}
                    onCheckedChange={(checked) => setApplyVatToOrder(checked as boolean)}
                    disabled={!uraComplianceEnabled}
                  />
                  <label htmlFor="vat-toggle" className="text-xs cursor-pointer whitespace-nowrap">
                    VAT {vatRate}%
                    {uraComplianceEnabled ? (
                      <span className="text-blue-600 ml-1">(Auto)</span>
                    ) : (
                      <span className="ml-1">(URA off)</span>
                    )}
                  </label>
                </div>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions..."
                  className="h-10 lg:h-8 text-sm flex-1 min-w-0"
                />
              </div>

              {/* Balance display */}
              {amountPaid > 0 && balance > 0 && (
                <div className="text-center text-sm font-medium text-yellow-600 bg-yellow-50 dark:bg-yellow-950 rounded py-1">
                  Balance: {formatUGX(balance)}
                </div>
              )}
              {amountPaid >= total && total > 0 && (
                <div className="text-center text-sm font-medium text-green-600 bg-green-50 dark:bg-green-950 rounded py-1">
                  ✓ Fully paid
                </div>
              )}

              {/* Backdate toggle — admin / manager only */}
              {canBackdate && (
                <div className="border border-dashed border-amber-400 rounded-lg px-3 py-2 bg-amber-50 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="use-backdate"
                      checked={useBackdate}
                      onCheckedChange={(v) => setUseBackdate(!!v)}
                    />
                    <label htmlFor="use-backdate" className="text-xs font-medium text-amber-700 dark:text-amber-300 cursor-pointer select-none">
                      Record for a past date (historical entry)
                    </label>
                  </div>
                  {useBackdate && (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-xs text-amber-600 dark:text-amber-400 whitespace-nowrap">Order Date:</label>
                      <input
                        type="date"
                        value={orderDate}
                        max={kampalaTodayYmd()}
                        onChange={(e) => setOrderDate(e.target.value)}
                        className="text-xs border rounded px-2 py-1 h-7 bg-background text-foreground flex-1"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Create Order Button */}
              <Button
                className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90"
                onClick={handleCreateOrder}
                disabled={loading || !selectedCustomer || orderItems.length === 0}
              >
                {loading ? (
                  'Creating...'
                ) : (
                  <>
                    <Save className="mr-2 h-5 w-5" />
                    Create Order • {formatUGX(total)}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* ===== RIGHT PANEL: Item Catalog (3/5 width) ===== */}
          <div className="order-1 lg:order-2 lg:col-span-3 flex flex-col min-h-0 bg-card border rounded-lg">
            
            {/* Category Tabs + Search */}
            <div className="px-3 pt-3 pb-2 border-b space-y-2 shrink-0">
              {/* Category tabs like Odoo POS */}
              <div className="flex gap-1 overflow-x-auto pb-1">
                {['ALL', 'gents', 'ladies', 'general', 'kids'].map((cat) => (
                  <Button
                    key={cat}
                    variant={categoryFilter === cat ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setCategoryFilter(cat)}
                    className={`shrink-0 h-10 lg:h-8 text-xs font-medium ${
                      categoryFilter === cat 
                        ? 'bg-primary text-primary-foreground shadow-sm' 
                        : 'hover:bg-muted'
                    }`}
                  >
                    {cat === 'ALL' ? '🏠 All' 
                      : cat === 'gents' ? '👔 Gents' 
                      : cat === 'ladies' ? '👗 Ladies' 
                      : cat === 'general' ? '🏠 Household' 
                      : '👶 Kids'}
                  </Button>
                ))}
              </div>
              
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="pl-10 h-10 lg:h-8 text-sm"
                />
              </div>
            </div>

            {/* Items grid. Capped on phones so the cart below stays reachable;
                on desktop it simply fills the remaining column height. */}
            <div className="flex-1 overflow-y-auto p-3 min-h-0 max-h-[60vh] lg:max-h-none">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                {filteredPriceItems.map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-3 hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group bg-background"
                  >
                    {/* Item name + category */}
                    <p className="font-medium text-sm leading-tight truncate" title={item.name}>
                      {item.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 mt-1">
                      <span className="text-[11px] lg:text-[10px] text-muted-foreground capitalize">
                        {item.category === 'home_services' ? 'Home' : item.category}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 capitalize">
                        {item.unit || 'piece'}
                      </Badge>
                      {item.has_active_discount && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                          -{item.discount_percentage}%
                        </Badge>
                      )}
                    </div>
                    
                    {/* Prices */}
                    <div className="mt-2 space-y-0.5 text-xs">
                      {item.pricing_type === 'PER_KG' ? (
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-muted-foreground shrink-0">⚖️ Per kg</span>
                          <span className="font-semibold text-amber-600 dark:text-amber-400 min-w-0 text-right truncate">
                            {formatUGX(item.price_per_kg || item.price)}/kg
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-muted-foreground shrink-0">Wash</span>
                            <span className="font-semibold min-w-0 text-right truncate">
                              {item.has_active_discount ? (
                                <>
                                  <span className="line-through text-muted-foreground mr-1 font-normal">
                                    {formatUGX(item.price)}
                                  </span>
                                  {formatUGX(item.effective_price || item.price)}
                                </>
                              ) : formatUGX(item.price)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-muted-foreground shrink-0">Iron</span>
                            <span className="font-semibold min-w-0 text-right truncate">
                              {Number(item.ironing_price) > 0 ? (
                                item.has_active_discount ? formatUGX(item.effective_ironing_price || item.ironing_price) : formatUGX(item.ironing_price)
                              ) : (
                                <span className="text-muted-foreground text-[10px]">N/A</span>
                              )}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    
                    {/* Quick-add service buttons (2 rows for visibility) */}
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-10 lg:h-7 text-xs lg:text-[11px] px-1.5 font-medium hover:bg-primary hover:text-primary-foreground"
                          onClick={() => addItemToOrder(item, 'WASH')}
                        >
                          🧺<span className="hidden min-[360px]:inline ml-0.5">Wash</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={`flex-1 h-10 lg:h-7 text-xs lg:text-[11px] px-1.5 font-medium ${Number(item.ironing_price) > 0 ? 'border-blue-300 text-blue-600 hover:bg-blue-500 hover:text-white dark:border-blue-700 dark:text-blue-400' : 'opacity-40 cursor-not-allowed'}`}
                          onClick={() => addItemToOrder(item, 'IRON')}
                          disabled={!(Number(item.ironing_price) > 0)}
                        >
                          🔥<span className="hidden min-[360px]:inline ml-0.5">Iron</span>
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-10 lg:h-7 text-xs lg:text-[11px] px-1.5 font-medium border-orange-300 text-orange-600 hover:bg-orange-500 hover:text-white dark:border-orange-700 dark:text-orange-400"
                        onClick={() => addItemToOrder(item, 'EXPRESS')}
                      >
                        ⚡<span className="hidden min-[360px]:inline ml-0.5">Express</span>
                      </Button>
                    </div>
                  </div>
                ))}
                {filteredPriceItems.length === 0 && (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p>No items found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add New Customer Dialog */}
      <Dialog open={showAddCustomerDialog} onOpenChange={setShowAddCustomerDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Quickly add a new customer to the system
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-name">Name *</Label>
                <Input
                  id="new-name"
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                  placeholder="Customer name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-phone">Phone *</Label>
                <Input
                  id="new-phone"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                  placeholder="+256 *** *** ***"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Email (Optional)</Label>
              <Input
                id="new-email"
                type="email"
                value={newCustomerForm.email}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-location">Location (Optional)</Label>
              <Input
                id="new-location"
                value={newCustomerForm.location}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, location: e.target.value })}
                placeholder="City, District"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-customer-type">Customer Type</Label>
              <Select
                value={newCustomerForm.customer_type}
                onValueChange={(v: 'INDIVIDUAL' | 'BUSINESS') => setNewCustomerForm({ ...newCustomerForm, customer_type: v })}
              >
                <SelectTrigger id="new-customer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="new-sms-opt-in"
                checked={newCustomerForm.sms_opt_in}
                onCheckedChange={(checked) =>
                  setNewCustomerForm({ ...newCustomerForm, sms_opt_in: checked as boolean })
                }
              />
              <Label htmlFor="new-sms-opt-in" className="text-sm font-normal cursor-pointer">
                Customer agrees to receive WhatsApp/SMS notifications
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCustomerDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleQuickAddCustomer} disabled={addingCustomer}>
              {addingCustomer ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              {addingCustomer ? 'Adding...' : 'Add Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Messenger after order create */}
      <Dialog
        open={whatsappDialogOpen}
        onOpenChange={(open) => {
          setWhatsappDialogOpen(open);
          if (!open) setPendingWhatsApp(null);
        }}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              Send via WhatsApp Messenger
            </DialogTitle>
            <DialogDescription>
              {pendingWhatsApp
                ? `Order ${pendingWhatsApp.orderNumber} for ${pendingWhatsApp.customerName}. WhatsApp should open with the confirmation message ready — tap Send on your phone.`
                : 'Send the order confirmation on WhatsApp.'}
            </DialogDescription>
          </DialogHeader>
          {pendingWhatsApp && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                To: {pendingWhatsApp.customerName} ({pendingWhatsApp.phone})
              </div>
              <Label htmlFor="new-order-wa-message">Message (edit before sending)</Label>
              <textarea
                id="new-order-wa-message"
                className="w-full min-h-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                value={pendingWhatsApp.message}
                onChange={(e) =>
                  setPendingWhatsApp({ ...pendingWhatsApp, message: e.target.value })
                }
              />
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setWhatsappDialogOpen(false);
                setPendingWhatsApp(null);
              }}
            >
              Done
            </Button>
            <Button
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
              onClick={() => {
                if (pendingWhatsApp) {
                  sendOrderViaWhatsApp(pendingWhatsApp.phone, pendingWhatsApp.message);
                }
              }}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Open WhatsApp Again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

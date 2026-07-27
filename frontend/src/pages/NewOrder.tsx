import { MainLayout } from '@/components/layout/MainLayout';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
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
  subtotal: number;
  unit?: string;
}


const MAX_DISCOUNT_BY_ROLE: Record<string, number> = {
  DESKTOP_AGENT: 10,
  MANAGER: 20,
  ADMIN: 50,
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

export default function NewOrder() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const maxDiscountPercent = MAX_DISCOUNT_BY_ROLE[user?.role ?? 'DESKTOP_AGENT'] ?? 10;

  // URA Compliance state
  const [uraComplianceEnabled, setUraComplianceEnabled] = useState(false);
  const [applyVatToOrder, setApplyVatToOrder] = useState(false); // Per-order VAT control

  // Customer state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerPopover, setShowCustomerPopover] = useState(false);
  const [showAddCustomerDialog, setShowAddCustomerDialog] = useState(false);

  // Price items state
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Order state
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [transactionDiscount, setTransactionDiscount] = useState(0);
  const [bargainAmount, setBargainAmount] = useState(0);
  const [maxBargainAmount, setMaxBargainAmount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'UNPAID' | 'PARTIAL'>('UNPAID');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'ON_ACCOUNT'>('CASH');
  const [mobileProvider, setMobileProvider] = useState<'MTN' | 'AIRTEL'>('MTN');
  const [transactionRef, setTransactionRef] = useState('');
  const [amountPaid, setAmountPaid] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

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
        params: { category: categoryFilter !== 'ALL' ? categoryFilter : undefined },
      });
      setPriceItems(response.data.prices || []);
    } catch (error) {
      console.error('Error fetching price items:', error);
    }
  }, [token, categoryFilter]);

  // Fetch URA compliance setting
  const fetchURASettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/settings/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const settings = response.data;
      setUraComplianceEnabled(settings.ura_compliance_enabled === 'true' || settings.ura_compliance_enabled === true);
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
      setMaxBargainAmount(response.data.user.max_bargain_amount || 0);
    } catch (error) {
      console.error('Error fetching user bargain limit:', error);
      setMaxBargainAmount(0);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchCustomers();
      fetchPriceItems();
      fetchURASettings();
      fetchUserBargainLimit();
    }
  }, [token, fetchCustomers, fetchPriceItems, fetchURASettings, fetchUserBargainLimit]);

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
      updated[existingIndex].quantity += item.unit === 'kg' ? 0.5 : 1;
      updated[existingIndex].subtotal = Number(updated[existingIndex].quantity) * Number(updated[existingIndex].unit_price);
      setOrderItems(updated);
    } else {
      setOrderItems([
        ...orderItems,
        {
          price_item_id: item.id,
          item_name: item.name,
          service_type: serviceType,
          quantity: 1,
          unit_price: unitPrice,
          subtotal: unitPrice,
          unit: item.unit || 'piece',
        },
      ]);
    }

    toast({
      title: '✅ Item Added',
      description: `${item.name} (${serviceType})`,
    });
  };

  // Update quantity
  const updateQuantity = (index: number, newQuantity: number) => {
    const currentItem = orderItems[index];
    const minimumQuantity = currentItem.unit === 'kg' ? 0.5 : 1;
    const normalizedQuantity = currentItem.unit === 'kg'
      ? Math.max(minimumQuantity, Math.round(newQuantity * 2) / 2)
      : Math.max(minimumQuantity, Math.round(newQuantity));

    if (normalizedQuantity < minimumQuantity) return;
    const updated = [...orderItems];
    updated[index].quantity = normalizedQuantity;
    updated[index].subtotal = Number(updated[index].quantity) * Number(updated[index].unit_price);
    setOrderItems(updated);
  };

  // Remove item
  const removeItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
    toast({
      title: 'Item Removed',
      description: 'Item removed from order',
    });
  };

  // Calculate totals with conditional VAT (URA enabled globally OR per-order toggle)
  const VAT_RATE = (uraComplianceEnabled || applyVatToOrder) ? 18.00 : 0; // Uganda VAT rate (18%)
  const itemsSubtotal = orderItems.reduce((sum, item) => sum + Number(item.subtotal), 0);
  const discountAmount = (itemsSubtotal * transactionDiscount) / 100;
  const subtotalAfterDiscount = itemsSubtotal - discountAmount - bargainAmount;
  const taxAmount = (uraComplianceEnabled || applyVatToOrder) ? (subtotalAfterDiscount * VAT_RATE) / 100 : 0;
  const total = subtotalAfterDiscount + taxAmount;
  const balance = total - amountPaid;
  
  // For backward compatibility
  const subtotal = itemsSubtotal;

  // Auto-update payment status based on amount paid
  useEffect(() => {
    if (amountPaid === 0) {
      setPaymentStatus('UNPAID');
    } else if (amountPaid >= total) {
      setPaymentStatus('PAID');
      setAmountPaid(total); // Cap at total
    } else {
      setPaymentStatus('PARTIAL');
    }
  }, [amountPaid, total]);

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

    try {
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
      toast({
        variant: 'destructive',
        title: 'Error',
        description: getApiErrorMessage(error, 'Failed to add customer'),
      });
    }
  };

  // Handle create order
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
      setLoading(true);

      const orderData = {
        customer_id: selectedCustomer.id,
        items: orderItems,
        subtotal: subtotalAfterDiscount,
        tax_rate: VAT_RATE,
        tax_amount: taxAmount,
        discount_percentage: transactionDiscount,
        discount_amount: discountAmount,
        bargain_amount: bargainAmount,
        total_amount: total,
        payment_status: paymentStatus,
        payment_method: paymentMethod === 'MOBILE_MONEY' ? `${paymentMethod}_${mobileProvider}` : paymentMethod,
        amount_paid: Math.min(amountPaid, total), // Cap at total to prevent overpayment
        transaction_reference: transactionRef || null,
        notes,
      };

      const response = await axios.post(`${API_BASE_URL}/orders`, orderData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const order = response.data.order;

      toast({
        title: '🎉 Order Created Successfully!',
        description: `Order ${order.order_number} has been created for ${selectedCustomer.name}`,
      });

      // TODO: Generate and send receipt (physical/WhatsApp/email)

      // Reset form
      setSelectedCustomer(null);
      setOrderItems([]);
      setTransactionDiscount(0);
      setBargainAmount(0);
      setApplyVatToOrder(false); // Reset VAT toggle
      setPaymentStatus('UNPAID');
      setPaymentMethod('CASH');
      setTransactionRef('');
      setAmountPaid(0);
      setNotes('');
      setItemSearch('');
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
          <div className="flex-1">
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
          {/* URA/VAT indicator */}
          {(uraComplianceEnabled || applyVatToOrder) && (
            <Badge variant="secondary" className="shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              VAT 18%
            </Badge>
          )}
        </div>

        {/* Main POS split: Left = Cart/Payment, Right = Item Catalog */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-3 lg:min-h-0">
          
          {/* ===== LEFT PANEL: Cart + Payment (2/5 width) ===== */}
          <div className="lg:col-span-2 flex flex-col gap-3 overflow-y-auto">
            
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
                    <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md group hover:bg-muted transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.item_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                            {item.service_type}
                          </Badge>
                            <span>{formatUGX(item.unit_price)} / {item.unit || 'piece'}</span>
                        </div>
                      </div>
                        <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => updateQuantity(index, item.quantity - (item.unit === 'kg' ? 0.5 : 1))}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                          <Input
                            type="number"
                            min={item.unit === 'kg' ? 0.5 : 1}
                            step={item.unit === 'kg' ? 0.5 : 1}
                            value={item.unit === 'kg' ? item.quantity.toFixed(1) : item.quantity}
                            onChange={(e) => updateQuantity(index, parseFloat(e.target.value) || (item.unit === 'kg' ? 0.5 : 1))}
                            className="h-6 w-16 text-center text-sm font-bold px-1"
                          />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => updateQuantity(index, item.quantity + (item.unit === 'kg' ? 0.5 : 1))}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="font-semibold text-sm w-24 text-right shrink-0">
                        {formatUGX(item.subtotal)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Totals + Payment + Actions */}
            <div className="bg-card border rounded-lg p-3 space-y-2">
              {/* Quick totals */}
              <div className="space-y-1 text-sm">
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
                {bargainAmount > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Bargain</span>
                    <span>-{formatUGX(bargainAmount)}</span>
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

              {/* Compact controls row */}
              <div className="grid grid-cols-3 gap-2">
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
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Bargain {maxBargainAmount > 0 && (
                      <span className="text-muted-foreground/70">(max {formatUGX(maxBargainAmount)})</span>
                    )}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max={maxBargainAmount}
                    value={bargainAmount || ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      if (value <= maxBargainAmount) {
                        setBargainAmount(value);
                      } else {
                        toast({
                          variant: 'destructive',
                          title: 'Bargain Limit',
                          description: `Max: ${formatUGX(maxBargainAmount)}`,
                        });
                      }
                    }}
                    placeholder="0"
                    className="h-8 text-sm mt-1"
                    disabled={maxBargainAmount === 0}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Amount Paid</Label>
                  <Input
                    type="number"
                    min="0"
                    value={amountPaid || ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      setAmountPaid(Math.min(value, total));
                    }}
                    placeholder="0"
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>

              {/* Payment method + status row */}
              <div className="grid grid-cols-2 gap-2">
                <Select value={paymentMethod} onValueChange={(v: 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'ON_ACCOUNT') => setPaymentMethod(v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">💵 Cash</SelectItem>
                    <SelectItem value="MOBILE_MONEY">📱 Mobile Money</SelectItem>
                    <SelectItem value="BANK_TRANSFER">🏦 Bank Transfer</SelectItem>
                    <SelectItem value="ON_ACCOUNT">📋 On Account</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={paymentStatus} onValueChange={(v: 'PAID' | 'UNPAID' | 'PARTIAL') => setPaymentStatus(v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAID">✅ Paid</SelectItem>
                    <SelectItem value="UNPAID">⏳ Unpaid</SelectItem>
                    <SelectItem value="PARTIAL">⚠️ Partial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Mobile money extras */}
              {paymentMethod === 'MOBILE_MONEY' && (
                <div className="grid grid-cols-2 gap-2">
                  <Select value={mobileProvider} onValueChange={(v: 'MTN' | 'AIRTEL') => setMobileProvider(v)}>
                    <SelectTrigger className="h-8 text-sm">
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
                    className="h-8 text-sm"
                  />
                </div>
              )}

              {/* Bank transfer ref */}
              {paymentMethod === 'BANK_TRANSFER' && (
                <Input
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="Bank Reference #"
                  className="h-8 text-sm"
                />
              )}

              {/* VAT + Notes row */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="vat-toggle"
                    checked={applyVatToOrder}
                    onCheckedChange={(checked) => setApplyVatToOrder(checked as boolean)}
                    disabled={uraComplianceEnabled}
                  />
                  <label htmlFor="vat-toggle" className="text-xs cursor-pointer">
                    VAT 18%
                    {uraComplianceEnabled && <span className="text-blue-600 ml-1">(Auto)</span>}
                  </label>
                </div>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions..."
                  className="h-8 text-sm flex-1"
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
          <div className="lg:col-span-3 flex flex-col min-h-0 bg-card border rounded-lg">
            
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
                    className={`shrink-0 h-8 text-xs font-medium ${
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
                  className="pl-10 h-8 text-sm"
                />
              </div>
            </div>

            {/* Items Grid (fills remaining space, scrolls internally) */}
            <div className="flex-1 overflow-y-auto p-3 min-h-0">
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
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-muted-foreground capitalize">
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
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Wash</span>
                        <span className="font-semibold">
                          {item.has_active_discount ? (
                            <><span className="line-through text-muted-foreground mr-1">{formatUGX(item.price)}</span>{formatUGX(item.effective_price || item.price)}</>
                          ) : formatUGX(item.price)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Iron</span>
                        <span className="font-semibold">
                          {Number(item.ironing_price) > 0 ? (
                            item.has_active_discount ? formatUGX(item.effective_ironing_price || item.ironing_price) : formatUGX(item.ironing_price)
                          ) : (
                            <span className="text-muted-foreground text-[10px]">N/A</span>
                          )}
                        </span>
                      </div>
                    </div>
                    
                    {/* Quick-add service buttons (2 rows for visibility) */}
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 text-[11px] px-1.5 font-medium hover:bg-primary hover:text-primary-foreground"
                          onClick={() => addItemToOrder(item, 'WASH')}
                        >
                          🧺<span className="hidden min-[375px]:inline ml-0.5">Wash</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={`flex-1 h-7 text-[11px] px-1.5 font-medium ${Number(item.ironing_price) > 0 ? 'border-blue-300 text-blue-600 hover:bg-blue-500 hover:text-white dark:border-blue-700 dark:text-blue-400' : 'opacity-40 cursor-not-allowed'}`}
                          onClick={() => addItemToOrder(item, 'IRON')}
                          disabled={!(Number(item.ironing_price) > 0)}
                        >
                          🔥<span className="hidden min-[375px]:inline ml-0.5">Iron</span>
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-[11px] px-1.5 font-medium border-orange-300 text-orange-600 hover:bg-orange-500 hover:text-white dark:border-orange-700 dark:text-orange-400"
                        onClick={() => addItemToOrder(item, 'EXPRESS')}
                      >
                        ⚡<span className="hidden min-[375px]:inline ml-0.5">Express</span>
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
                  placeholder="+256700123456"
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
            <Button onClick={handleQuickAddCustomer}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import axios, { AxiosError } from 'axios';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, CheckCircle, XCircle, AlertCircle, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PendingPayment {
  id: number;
  transaction_reference: string;
  payment_method: string;
  amount: number;
  sender_phone: string;
  sender_name: string | null;
  payment_date: string;
}

interface Order {
  id: number;
  order_number: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  created_at: string;
  order_status: string;
  payment_status: string;
  payment_method: string;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
}

interface CustomerWithUnpaid {
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  unpaid_order_count: number;
  total_balance_due: number;
  oldest_order_date: string;
  newest_order_date: string;
}

interface AssignPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PendingPayment | null;
  token: string;
  onSuccess: () => void;
}

export default function AssignPaymentDialog({
  isOpen,
  onClose,
  payment,
  token,
  onSuccess,
}: AssignPaymentDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Order[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<CustomerWithUnpaid[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithUnpaid | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentType, setPaymentType] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [notes, setNotes] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isLoadingCustomerOrders, setIsLoadingCustomerOrders] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const { toast } = useToast();

  const handleSearch = async (term: string = searchTerm) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      const response = await axios.get(
        `${API_BASE_URL}/pending-payments/search-orders?searchTerm=${encodeURIComponent(term)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSearchResults(response.data);
      
      if (response.data.length === 0) {
        toast({
          title: 'No results',
          description: 'No unpaid or partially paid orders found',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: 'Search failed',
        description: 'Failed to search for orders. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const loadRecentOrders = async () => {
    try {
      setIsLoadingRecent(true);
      // Search with empty term to get all unpaid/partial orders
      const response = await axios.get(
        `${API_BASE_URL}/pending-payments/search-orders?searchTerm=`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRecentOrders(response.data);
    } catch (error) {
      console.error('Failed to load recent orders:', error);
    } finally {
      setIsLoadingRecent(false);
    }
  };

  const loadCustomersWithUnpaidOrders = async () => {
    try {
      setIsLoadingCustomers(true);
      const response = await axios.get(
        `${API_BASE_URL}/pending-payments/customers-with-unpaid`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCustomers(response.data);
    } catch (error) {
      console.error('Failed to load customers:', error);
      toast({
        title: 'Failed to load customers',
        description: 'Could not load customer list',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  const loadCustomerOrders = async (customerId: number) => {
    try {
      setIsLoadingCustomerOrders(true);
      const response = await axios.get(
        `${API_BASE_URL}/pending-payments/customer/${customerId}/orders`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCustomerOrders(response.data);
    } catch (error) {
      console.error('Failed to load customer orders:', error);
      toast({
        title: 'Failed to load orders',
        description: 'Could not load customer orders',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingCustomerOrders(false);
    }
  };

  useEffect(() => {
    if (payment && isOpen) {
      // Load recent orders and customers
      loadRecentOrders();
      loadCustomersWithUnpaidOrders();
      loadRecentOrders();
      
      // Try to search by sender phone initially
      if (payment.sender_phone) {
        setSearchTerm(payment.sender_phone);
        handleSearch(payment.sender_phone);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment, isOpen]);

  const handleAssign = async () => {
    if (!selectedOrder || !payment) {
      console.error('❌ Missing selectedOrder or payment', { selectedOrder, payment });
      toast({
        title: 'Selection Required',
        description: 'Please select an order before assigning the payment',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsAssigning(true);
      const response = await axios.post(
        `${API_BASE_URL}/pending-payments/${payment.id}/assign`,
        {
          orderId: selectedOrder.id,
          paymentType,
          notes,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: '✅ Payment Assigned Successfully',
        description: `${formatUGX(payment.amount)} assigned to order ${selectedOrder.order_number}. Order balance updated!`,
      });

      onSuccess();
      handleClose();
    } catch (error) {
      console.error('❌ Assignment error:', error);
      const errorMessage = error instanceof AxiosError
        ? error.response?.data?.error 
        : 'Failed to assign payment';
      toast({
        title: 'Assignment failed',
        description: errorMessage || 'Failed to assign payment',
        variant: 'destructive',
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleClose = () => {
    setSearchTerm('');
    setSearchResults([]);
    setSelectedOrder(null);
    setPaymentType('FULL');
    setNotes('');
    onClose();
  };

  if (!payment) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            Assign Payment to Order
          </DialogTitle>
          <DialogDescription>
            Assign this mobile money payment to the correct customer order
          </DialogDescription>
        </DialogHeader>

        {/* Payment Details */}
        <div className="bg-muted p-3 sm:p-4 rounded-lg space-y-2">
          <h3 className="font-medium text-sm">Payment Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Amount:</span>
              <p className="font-semibold text-lg">{formatUGX(payment.amount)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Payment Method:</span>
              <p className="font-medium">
                {payment.payment_method === 'MOBILE_MONEY_MTN' ? 'MTN Mobile Money' : 'Airtel Money'}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Transaction Ref:</span>
              <p className="font-mono text-xs">{payment.transaction_reference}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Sender Phone:</span>
              <p className="font-medium">{payment.sender_phone}</p>
            </div>
            {payment.sender_name && (
              <div>
                <span className="text-muted-foreground">Sender Name:</span>
                <p className="font-medium">{payment.sender_name}</p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Payment Date:</span>
              <p>{new Date(payment.payment_date).toLocaleString('en-GB')}</p>
            </div>
          </div>
        </div>

        {/* Search Section */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="search">Search for Order</Label>
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <Input
                id="search"
                placeholder="Order number, customer name, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button
                onClick={() => handleSearch()}
                disabled={isSearching || !searchTerm.trim()}
                className="w-full sm:w-auto shrink-0"
              >
                <Search className="h-4 w-4 mr-2" />
                {isSearching ? 'Searching...' : 'Search'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              💡 Search by order number (e.g., ORD-001), customer name, or phone number
            </p>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Search Results ({searchResults.length})</h3>
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {searchResults.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className={`w-full p-3 sm:p-4 text-left hover:bg-muted transition-colors border-b last:border-b-0 ${
                      selectedOrder?.id === order.id ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                      <div>
                        <p className="font-semibold">{order.order_number}</p>
                        <p className="text-sm text-muted-foreground">{order.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{order.customer_phone}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">
                          Total: <span className="font-semibold">{formatUGX(order.total_amount)}</span>
                        </p>
                        <p className="text-sm">
                          Paid: <span className="text-green-600">{formatUGX(order.amount_paid)}</span>
                        </p>
                        <p className="text-sm font-medium text-orange-600">
                          Balance: {formatUGX(order.balance_due)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        order.payment_status === 'PAID' ? 'bg-green-100 text-green-800' :
                        order.payment_status === 'PARTIAL' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {order.payment_status}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        order.order_status === 'DELIVERED' ? 'bg-green-100 text-green-800' :
                        order.order_status === 'READY' ? 'bg-blue-100 text-blue-800' :
                        order.order_status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.order_status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent Unpaid Orders */}
          {!searchTerm && searchResults.length === 0 && recentOrders.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Recent Unpaid/Partial Orders</h3>
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {recentOrders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className={`w-full p-3 sm:p-4 text-left hover:bg-muted transition-colors border-b last:border-b-0 ${
                      selectedOrder?.id === order.id ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                      <div>
                        <p className="font-semibold">{order.order_number}</p>
                        <p className="text-sm text-muted-foreground">{order.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{order.customer_phone}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">
                          Total: <span className="font-semibold">{formatUGX(order.total_amount)}</span>
                        </p>
                        <p className="text-sm">
                          Paid: <span className="text-green-600">{formatUGX(order.amount_paid)}</span>
                        </p>
                        <p className="text-sm font-medium text-orange-600">
                          Balance: {formatUGX(order.balance_due)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        order.payment_status === 'PAID' ? 'bg-green-100 text-green-800' :
                        order.payment_status === 'PARTIAL' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {order.payment_status}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        order.order_status === 'DELIVERED' ? 'bg-green-100 text-green-800' :
                        order.order_status === 'READY' ? 'bg-blue-100 text-blue-800' :
                        order.order_status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.order_status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchTerm && searchResults.length === 0 && !isSearching && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No orders found</p>
              <p className="text-sm">Try searching by order number, customer name, or phone</p>
            </div>
          )}

          {!searchTerm && recentOrders.length === 0 && !isLoadingRecent && (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No unpaid or partially paid orders</p>
              <p className="text-sm">All orders are fully paid!</p>
            </div>
          )}

          {isLoadingRecent && (
            <div className="text-center py-8 text-muted-foreground">
              <p>Loading recent orders...</p>
            </div>
          )}
        </div>

        {/* Assignment Options */}
        {selectedOrder && (
          <div className="space-y-4 border-t pt-4">
            <div>
              <Label htmlFor="paymentType">Payment Type</Label>
              <Select value={paymentType} onValueChange={(value: 'FULL' | 'PARTIAL') => setPaymentType(value)}>
                <SelectTrigger id="paymentType" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL">Full Payment</SelectItem>
                  <SelectItem value="PARTIAL">Partial Payment</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {paymentType === 'FULL' 
                  ? 'This payment covers the full outstanding balance'
                  : 'This payment partially covers the outstanding balance'
                }
              </p>
            </div>

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any notes about this payment assignment..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2"
                rows={3}
              />
            </div>

            {/* Payment Summary */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg space-y-2">
              <h4 className="font-medium text-sm">Assignment Summary</h4>
              <div className="text-sm space-y-1">
                <p>Order: <span className="font-semibold">{selectedOrder.order_number}</span></p>
                <p>Customer: <span className="font-semibold">{selectedOrder.customer_name}</span></p>
                <p>Current Balance: <span className="font-semibold">{formatUGX(selectedOrder.balance_due)}</span></p>
                <p>Payment Amount: <span className="font-semibold text-green-600">{formatUGX(payment.amount)}</span></p>
                <p className="pt-2 border-t">
                  New Balance: <span className="font-semibold text-blue-600">
                    {formatUGX(Math.max(0, selectedOrder.balance_due - payment.amount))}
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isAssigning} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedOrder || isAssigning}
            className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {isAssigning ? 'Assigning...' : 'Assign Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

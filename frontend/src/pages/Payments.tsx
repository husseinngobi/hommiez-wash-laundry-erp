import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import AssignPaymentDialog from '@/components/payments/AssignPaymentDialog';
import {
  DollarSign,
  Search,
  Download,
  Eye,
  TrendingUp,
  CreditCard,
  Calendar,
  Phone,
  AlertCircle,
  Bell,
  CheckCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Printer,
  XCircle,
} from 'lucide-react';

interface Payment {
  id: number;
  order_number: string;
  payment_date: string;
  amount_paid: number;
  payment_method: string;
  payment_status: string;
  transaction_reference: string;
  total_amount: number;
  balance: number;
  customer_name: string;
  customer_phone: string;
  received_by: string;
}

interface PaymentStats {
  paymentsByMethod: Array<{
    method: string;
    transaction_count: number;
    total_amount: number;
  }>;
  summary: {
    total_transactions: number;
    total_revenue: number;
    fully_paid: number;
    partial_paid: number;
    outstanding_balance: number;
  };
}

interface PendingPayment {
  id: number;
  transaction_reference: string;
  payment_method: string;
  amount: number;
  sender_phone: string;
  sender_name: string | null;
  payment_date: string;
  status: string;
  updated_at?: string;
  notes?: string;
  rejected_by_name?: string;
}

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Payments = () => {
  const { token, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkOrderNumber = searchParams.get('orderNumber');

  // Highlight support: set when navigated from Orders or another page
  const [highlightedPaymentOrderNumber, setHighlightedPaymentOrderNumber] = useState<string | null>(null);
  const highlightPaymentRowRef = useRef<HTMLTableRowElement | null>(null);
  
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [cancelPaymentTarget, setCancelPaymentTarget] = useState<Payment | null>(null);
  const [cancellingPayment, setCancellingPayment] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Pending payments state
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'rejected'>('all');
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [rejectedPayments, setRejectedPayments] = useState<PendingPayment[]>([]);
  const [selectedPendingPayment, setSelectedPendingPayment] = useState<PendingPayment | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingRejected, setLoadingRejected] = useState(false);

  const [filters, setFilters] = useState({
    from_date: '',
    to_date: '',
    payment_method: '',
    search: '',
  });
  
  const [selectedPeriod, setSelectedPeriod] = useState('ALL_TIME');
  
  // Helper function to get date ranges for different periods
  const getPeriodDates = (period: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    
    switch (period) {
      case 'ALL_TIME':
        return { from_date: '', to_date: '' };

      case 'TODAY':
        return { from_date: formatLocalDate(now), to_date: formatLocalDate(now) };
      
      case 'THIS_WEEK': {
        const firstDayOfWeek = new Date(now);
        firstDayOfWeek.setDate(day - now.getDay()); // Sunday
        const lastDayOfWeek = new Date(firstDayOfWeek);
        lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6); // Saturday
        return {
          from_date: formatLocalDate(firstDayOfWeek),
          to_date: formatLocalDate(lastDayOfWeek)
        };
      }
      
      case 'THIS_MONTH':
        return {
          from_date: `${year}-${String(month + 1).padStart(2, '0')}-01`,
          to_date: `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`
        };
      
      case 'LAST_MONTH': {
        const lastMonth = month === 0 ? 11 : month - 1;
        const lastMonthYear = month === 0 ? year - 1 : year;
        return {
          from_date: `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`,
          to_date: `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-${String(new Date(lastMonthYear, lastMonth + 1, 0).getDate()).padStart(2, '0')}`
        };
      }
      
      case 'THIS_YEAR':
        return {
          from_date: `${year}-01-01`,
          to_date: `${year}-12-31`
        };
      
      case 'LAST_YEAR':
        return {
          from_date: `${year - 1}-01-01`,
          to_date: `${year - 1}-12-31`
        };
      
      case 'CUSTOM':
      default:
        return filters; // Keep current dates for custom
    }
  };
  
  // Handle period change
  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    if (period !== 'CUSTOM') {
      const dates = getPeriodDates(period);
      setFilters({ ...filters, ...dates });
    }
  };

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== '')),
      });

      const response = await axios.get(`${API_BASE_URL}/payments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setPayments(response.data.payments);
      setTotalPages(response.data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch payments:', error);
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [token, currentPage, filters]);

  const fetchStatistics = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const params = new URLSearchParams({
        from_date: filters.from_date,
        to_date: filters.to_date,
      });

      const response = await axios.get(`${API_BASE_URL}/payments/statistics/summary?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
    }
  }, [token, isAdmin, filters.from_date, filters.to_date]);

  const handleCancelPayment = async () => {
    if (!cancelPaymentTarget || !token || cancellingPayment) return;

    try {
      setCancellingPayment(true);
      const response = await axios.post(
        `${API_BASE_URL}/payments/${cancelPaymentTarget.id}/cancel`,
        { reason: 'Admin cancelled from Payments page' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const newStatus = response.data?.order?.payment_status;
      toast.success(
        newStatus
          ? `Payment cancelled. Order ${cancelPaymentTarget.order_number} is now ${newStatus}.`
          : 'Payment cancelled.'
      );

      setCancelPaymentTarget(null);
      setShowDetailsDialog(false);
      setSelectedPayment(null);
      fetchPayments();
      if (isAdmin) fetchStatistics();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string; message?: string } } };
      toast.error(
        axiosError.response?.data?.message ||
          axiosError.response?.data?.error ||
          'Failed to cancel payment'
      );
    } finally {
      setCancellingPayment(false);
    }
  };

  const fetchPendingPayments = useCallback(async () => {
    try {
      setLoadingPending(true);
      const response = await axios.get(`${API_BASE_URL}/pending-payments/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingPayments(response.data);
    } catch (error) {
      console.error('Failed to fetch pending payments:', error);
    } finally {
      setLoadingPending(false);
    }
  }, [token]);

  const fetchRejectedPayments = useCallback(async () => {
    if (!isAdmin) return;
    
    try {
      setLoadingRejected(true);
      const response = await axios.get(`${API_BASE_URL}/pending-payments/rejected`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRejectedPayments(response.data);
    } catch (error) {
      console.error('Failed to fetch rejected payments:', error);
    } finally {
      setLoadingRejected(false);
    }
  }, [token, isAdmin]);

  const handleRejectPayment = async (paymentId: number) => {
    if (!confirm('Are you sure you want to reject this payment?')) return;

    try {
      await axios.post(
        `${API_BASE_URL}/pending-payments/${paymentId}/reject`,
        { reason: 'Rejected by staff' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Payment rejected successfully');
      fetchPendingPayments();
      fetchRejectedPayments();
    } catch (error) {
      console.error('Failed to reject payment:', error);
      toast.error('Failed to reject payment');
    }
  };

  const handleReassignPayment = async (paymentId: number) => {
    if (!confirm('Reassign this rejected payment back to pending?')) return;

    try {
      await axios.post(
        `${API_BASE_URL}/pending-payments/${paymentId}/reassign`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Payment reassigned to pending successfully');
      fetchRejectedPayments();
      fetchPendingPayments();
    } catch (error) {
      console.error('Failed to reassign payment:', error);
      toast.error('Failed to reassign payment');
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!confirm('⚠️ PERMANENTLY DELETE this payment? This action cannot be undone!')) return;

    try {
      await axios.delete(
        `${API_BASE_URL}/pending-payments/${paymentId}/delete`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Payment deleted permanently');
      fetchRejectedPayments();
    } catch (error) {
      console.error('Failed to delete payment:', error);
      toast.error('Failed to delete payment');
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchStatistics();
    fetchPendingPayments();
    if (isAdmin) {
      fetchRejectedPayments();
    }
  }, [fetchPayments, fetchStatistics, fetchPendingPayments, fetchRejectedPayments, isAdmin]);

  // Deep-link support: auto-filter by order number when navigated with ?orderNumber=
  useEffect(() => {
    if (!deepLinkOrderNumber) return;

    // Clear date range so linked order payment is always visible
    setSelectedPeriod('CUSTOM');
    setFilters({
      from_date: '',
      to_date: '',
      payment_method: '',
      search: deepLinkOrderNumber,
    });
    setCurrentPage(1);
    // Also highlight the rows for this order number
    setHighlightedPaymentOrderNumber(deepLinkOrderNumber);

    const timer = setTimeout(() => {
      setSearchParams({});
    }, 100);

    return () => clearTimeout(timer);
  }, [deepLinkOrderNumber, setSearchParams]);

  // Scroll to first highlighted payment row and clear after 5 s
  useEffect(() => {
    if (!highlightedPaymentOrderNumber) return;
    const scroll = setTimeout(() => {
      if (highlightPaymentRowRef.current) {
        highlightPaymentRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 600);
    const clear = setTimeout(() => {
      setHighlightedPaymentOrderNumber(null);
    }, 6000);
    return () => {
      clearTimeout(scroll);
      clearTimeout(clear);
    };
  }, [highlightedPaymentOrderNumber, payments]);

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams({
        from_date: filters.from_date,
        to_date: filters.to_date,
        payment_method: filters.payment_method,
      });

      const response = await axios.get(`${API_BASE_URL}/payments/export/csv?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payments_${filters.from_date}_to_${filters.to_date}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('Payments exported to CSV successfully');
    } catch (error) {
      console.error('Failed to export payments:', error);
      toast.error('Failed to export payments');
    }
  };
  
  const handleExportPDF = async () => {
    try {
      const params = new URLSearchParams({
        from_date: filters.from_date,
        to_date: filters.to_date,
        payment_method: filters.payment_method,
      });

      const response = await axios.get(`${API_BASE_URL}/payments/export/pdf?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payments_${filters.from_date}_to_${filters.to_date}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('Payments exported to PDF successfully');
    } catch (error) {
      console.error('Failed to export PDF:', error);
      toast.error('Failed to export payments to PDF');
    }
  };

  const getPaymentMethodBadge = (method: string) => {
    if (method.includes('MTN')) {
      return <Badge className="bg-yellow-500 hover:bg-yellow-600">MTN Mobile Money</Badge>;
    } else if (method.includes('AIRTEL')) {
      return <Badge className="bg-red-500 hover:bg-red-600">Airtel Money</Badge>;
    } else if (method === 'CASH') {
      return <Badge className="bg-green-500 hover:bg-green-600">Cash</Badge>;
    } else if (method === 'BANK_TRANSFER') {
      return <Badge className="bg-blue-500 hover:bg-blue-600">Bank Transfer</Badge>;
    } else if (method === 'ON_ACCOUNT') {
      return <Badge className="bg-gray-500 hover:bg-gray-600">On Account</Badge>;
    }
    return <Badge>{method}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      PAID: 'bg-green-500 hover:bg-green-600',
      PARTIAL: 'bg-yellow-500 hover:bg-yellow-600',
      UNPAID: 'bg-red-500 hover:bg-red-600',
    };
    return <Badge className={styles[status as keyof typeof styles] || ''}>{status}</Badge>;
  };

  const openLinkedOrder = (orderNumber?: string) => {
    if (!orderNumber) return;
    setShowDetailsDialog(false);
    navigate('/orders', { state: { searchOrderNumber: orderNumber, highlightOrderNumber: orderNumber } });
  };

  const printPaymentReceipt = (payment: Payment) => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Payment Receipt - ${payment.order_number}</title>
      <style>
        body{font-family:Arial,sans-serif;max-width:320px;margin:24px auto;color:#111}
        h1{font-size:18px;margin:0 0 4px;text-align:center}
        .sub{text-align:center;color:#555;font-size:12px;margin-bottom:16px}
        .row{display:flex;justify-content:space-between;margin:6px 0;font-size:13px}
        .total{border-top:1px dashed #999;margin-top:12px;padding-top:10px;font-weight:700;font-size:15px}
        .foot{text-align:center;margin-top:18px;font-size:11px;color:#666}
      </style></head><body>
      <h1>Lush Dry Cleaners &amp; Laundromat</h1>
      <div class="sub">Payment Receipt</div>
      <div class="row"><span>Order</span><strong>${payment.order_number}</strong></div>
      <div class="row"><span>Customer</span><strong>${payment.customer_name}</strong></div>
      <div class="row"><span>Date</span><span>${new Date(payment.payment_date).toLocaleString()}</span></div>
      <div class="row"><span>Method</span><span>${payment.payment_method.replace(/_/g, ' ')}</span></div>
      ${payment.transaction_reference ? `<div class="row"><span>Reference</span><span>${payment.transaction_reference}</span></div>` : ''}
      <div class="row"><span>Order total</span><span>${formatUGX(payment.total_amount)}</span></div>
      <div class="row total"><span>Amount received</span><span>${formatUGX(payment.amount_paid)}</span></div>
      <div class="row"><span>Balance due</span><span>${formatUGX(payment.balance)}</span></div>
      <div class="row"><span>Received by</span><span>${payment.received_by || 'Staff'}</span></div>
      <div class="foot">Thank you for choosing Lush</div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    win.document.close();
  };


  return (
    <MainLayout
      title="Payments"
      subtitle={isAdmin ? "Track all payments and financial transactions" : "View payment transactions"}
    >
      <div className="space-y-6">
        {/* Tabs for All Payments vs Pending Payments */}
        <div className="border-b border-border">
          <div className="flex gap-2 sm:gap-4 flex-wrap">
            <button
              onClick={() => setActiveTab('all')}
              className={`pb-3 px-1 border-b-2 font-medium transition-colors text-sm sm:text-base ${
                activeTab === 'all'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              All Payments
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`pb-3 px-1 border-b-2 font-medium transition-colors relative text-sm sm:text-base ${
                activeTab === 'pending'
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Bell className="h-4 w-4" />
                <span className="hidden sm:inline">Pending Assignments</span>
                <span className="sm:hidden">Pending</span>
                {pendingPayments.length > 0 && (
                  <Badge variant="secondary" className="bg-yellow-500 text-white">
                    {pendingPayments.length}
                  </Badge>
                )}
              </div>
            </button>
            {isAdmin && (
              <button
                onClick={() => setActiveTab('rejected')}
                className={`pb-3 px-1 border-b-2 font-medium transition-colors relative text-sm sm:text-base ${
                  activeTab === 'rejected'
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Rejected
                  {rejectedPayments.length > 0 && (
                    <Badge variant="secondary" className="bg-red-500 text-white">
                      {rejectedPayments.length}
                    </Badge>
                  )}
                </div>
              </button>
            )}
          </div>
        </div>

        {activeTab === 'all' && (
          <>
            {/* Statistics Cards - Admin Only */}
            {isAdmin && stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold break-all">{formatUGX(stats.summary.total_revenue)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.summary.total_transactions} transactions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Fully Paid</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold text-green-600 break-all">{formatUGX(stats.summary.fully_paid)}</div>
                <p className="text-xs text-muted-foreground mt-1">Complete payments</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Partial Payments</CardTitle>
                <CreditCard className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold text-yellow-600 break-all">{formatUGX(stats.summary.partial_paid)}</div>
                <p className="text-xs text-muted-foreground mt-1">Awaiting balance</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold text-red-600 break-all">{formatUGX(stats.summary.outstanding_balance)}</div>
                <p className="text-xs text-muted-foreground mt-1">Pending collection</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Payment Method Breakdown - Admin Only */}
        {isAdmin && stats && stats.paymentsByMethod.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.paymentsByMethod.map((method) => (
                  <div key={method.method} className="flex items-center justify-between p-3 bg-muted rounded-lg gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-wrap">
                      {getPaymentMethodBadge(method.method)}
                      <span className="text-xs sm:text-sm text-muted-foreground">
                        {method.transaction_count} txn{method.transaction_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="font-semibold text-sm sm:text-base whitespace-nowrap">{formatUGX(method.total_amount)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filter Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <Label>Period</Label>
                <Select
                  value={selectedPeriod}
                  onValueChange={handlePeriodChange}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_TIME">All Time</SelectItem>
                    <SelectItem value="TODAY">Today</SelectItem>
                    <SelectItem value="THIS_WEEK">This Week</SelectItem>
                    <SelectItem value="THIS_MONTH">This Month</SelectItem>
                    <SelectItem value="LAST_MONTH">Last Month</SelectItem>
                    <SelectItem value="THIS_YEAR">This Year</SelectItem>
                    <SelectItem value="LAST_YEAR">Last Year ({new Date().getFullYear() - 1})</SelectItem>
                    <SelectItem value="CUSTOM">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>From Date</Label>
                <Input
                  type="date"
                  value={filters.from_date}
                  onChange={(e) => {
                    setFilters({ ...filters, from_date: e.target.value });
                    setSelectedPeriod('CUSTOM');
                  }}
                  className="mt-2"
                  disabled={selectedPeriod !== 'CUSTOM'}
                />
              </div>
              <div>
                <Label>To Date</Label>
                <Input
                  type="date"
                  value={filters.to_date}
                  onChange={(e) => {
                    setFilters({ ...filters, to_date: e.target.value });
                    setSelectedPeriod('CUSTOM');
                  }}
                  className="mt-2"
                  disabled={selectedPeriod !== 'CUSTOM'}
                />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select
                  value={filters.payment_method || 'ALL'}
                  onValueChange={(value) => setFilters({ ...filters, payment_method: value === 'ALL' ? '' : value })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="All Methods" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Methods</SelectItem>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="MTN">MTN Mobile Money</SelectItem>
                    <SelectItem value="AIRTEL">Airtel Money</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="ON_ACCOUNT">On Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Search</Label>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Order number, customer..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3 mt-4">
              <Button onClick={fetchPayments} className="w-full sm:w-auto">
                <Search className="w-4 h-4 mr-2" />
                Apply Filters
              </Button>
              {isAdmin && (
                <>
                  <Button variant="outline" onClick={handleExportCSV} className="flex-1 sm:flex-none">
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                  <Button variant="outline" onClick={handleExportPDF} className="flex-1 sm:flex-none">
                    <Download className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payments Table */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-3 sm:px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Date</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Order #</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Customer</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Method</th>
                    <th className="px-3 sm:px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Amount</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Status</th>
                    <th className="px-3 sm:px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Reference</th>
                    <th className="px-3 sm:px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        Loading...
                      </td>
                    </tr>
                  ) : payments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        No payments found
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment, idx) => {
                      const isHighlighted = highlightedPaymentOrderNumber === payment.order_number;
                      const isFirstHighlighted = isHighlighted && payments.findIndex(p => p.order_number === highlightedPaymentOrderNumber) === idx;
                      return (
                      <tr
                        key={payment.id}
                        ref={isFirstHighlighted ? (el) => { highlightPaymentRowRef.current = el; } : undefined}
                        className={[
                          'border-b dark:border-gray-700 transition-colors duration-150 cursor-pointer',
                          isHighlighted
                            ? 'bg-blue-50 dark:bg-blue-950/30 outline outline-2 outline-blue-500 outline-offset-[-2px]'
                            : 'hover:bg-muted/60',
                        ].join(' ')}
                        onClick={() => {
                          setSelectedPayment(payment);
                          setShowDetailsDialog(true);
                        }}
                      >
                        <td className="px-4 py-3 text-sm dark:text-gray-300">
                          {new Date(payment.payment_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium dark:text-gray-200">
                          <button
                            type="button"
                            className="text-primary underline-offset-2 hover:underline font-semibold"
                            onClick={(e) => { e.stopPropagation(); openLinkedOrder(payment.order_number); }}
                            title="Open linked order"
                          >
                            {payment.order_number}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm dark:text-gray-300">
                          <div>{payment.customer_name}</div>
                          <div className="text-xs text-muted-foreground">{payment.customer_phone}</div>
                        </td>
                        <td className="px-4 py-3">{getPaymentMethodBadge(payment.payment_method)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-sm dark:text-gray-200">
                          {formatUGX(payment.amount_paid)}
                          {payment.balance > 0 && (
                            <div className="text-xs text-yellow-600 dark:text-yellow-400">
                              Balance: {formatUGX(payment.balance)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(payment.payment_status)}</td>
                        <td className="px-4 py-3 text-sm dark:text-gray-300">
                          {payment.transaction_reference || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              title="Payment details"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPayment(payment);
                                setShowDetailsDialog(true);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              title="Open order"
                              onClick={(e) => {
                                e.stopPropagation();
                                openLinkedOrder(payment.order_number);
                              }}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                            {isAdmin && Number(payment.amount_paid) > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                title="Cancel this payment"
                                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCancelPaymentTarget(payment);
                                }}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 mt-4 sm:mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-full sm:w-auto"
                >
                  <ChevronLeft className="h-4 w-4 sm:mr-1" />
                  <span className="sm:hidden">Prev</span>
                  <span className="hidden sm:inline">Previous</span>
                </Button>
                <span className="px-3 py-1 text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-full sm:w-auto"
                >
                  <span className="sm:hidden">Next</span>
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4 sm:ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
          </>
        )}

        {/* Pending Payments Tab */}
        {activeTab === 'pending' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-yellow-600" />
                Unassigned Mobile Money Payments
              </CardTitle>
              <CardDescription>
                These payments were received but need to be assigned to specific orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPending ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Loading pending payments...</p>
                </div>
              ) : pendingPayments.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                  <p className="text-muted-foreground">No pending payments to assign</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    All mobile money payments have been assigned to orders
                  </p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Transaction Ref</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Sender Info</TableHead>
                        <TableHead>Payment Method</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-mono text-sm">
                            {payment.transaction_reference}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {formatUGX(payment.amount)}
                          </TableCell>
                          <TableCell>
                            <div>
                              {payment.sender_name && (
                                <div className="font-medium">{payment.sender_name}</div>
                              )}
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {payment.sender_phone}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {getPaymentMethodBadge(payment.payment_method)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {new Date(payment.payment_date).toLocaleDateString('en-UG')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(payment.payment_date).toLocaleTimeString('en-UG', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedPendingPayment(payment);
                                  setShowAssignDialog(true);
                                }}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Assign
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRejectPayment(payment.id)}
                              >
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Rejected Payments Tab (Admin Only) */}
        {activeTab === 'rejected' && isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                Rejected Payments
              </CardTitle>
              <CardDescription>
                Payments rejected as invalid, duplicate, or fraud. You can reassign or permanently delete.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRejected ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Loading rejected payments...</p>
                </div>
              ) : rejectedPayments.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                  <p className="text-muted-foreground">No rejected payments</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    All payments are either assigned or pending
                  </p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Transaction Ref</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Sender Info</TableHead>
                        <TableHead>Payment Method</TableHead>
                        <TableHead>Rejected Date</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rejectedPayments.map((payment) => (
                        <TableRow key={payment.id} className="bg-red-50">
                          <TableCell className="font-mono text-sm">
                            {payment.transaction_reference}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {formatUGX(payment.amount)}
                          </TableCell>
                          <TableCell>
                            <div>
                              {payment.sender_name && (
                                <div className="font-medium">{payment.sender_name}</div>
                              )}
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {payment.sender_phone}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {getPaymentMethodBadge(payment.payment_method)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {new Date(payment.updated_at || payment.payment_date).toLocaleDateString('en-UG')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(payment.updated_at || payment.payment_date).toLocaleTimeString('en-UG', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-muted-foreground">
                              {payment.notes || 'No reason provided'}
                            </p>
                            {payment.rejected_by_name && (
                              <p className="text-xs text-muted-foreground mt-1">
                                By: {payment.rejected_by_name}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                                onClick={() => handleReassignPayment(payment.id)}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Reassign
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeletePayment(payment.id)}
                              >
                                Delete Forever
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Payment Details Dialog */}
      {selectedPayment && (
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Payment Details</DialogTitle>
              <DialogDescription>Order {selectedPayment.order_number}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label className="text-gray-600">Customer</Label>
                <p className="font-medium">{selectedPayment.customer_name}</p>
                <p className="text-sm text-muted-foreground">{selectedPayment.customer_phone}</p>
              </div>
              <div>
                <Label className="text-gray-600">Payment Date</Label>
                <p className="font-medium">{new Date(selectedPayment.payment_date).toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-gray-600">Payment Method</Label>
                <div className="mt-1">{getPaymentMethodBadge(selectedPayment.payment_method)}</div>
              </div>
              <div>
                <Label className="text-gray-600">Transaction Reference</Label>
                <p className="font-medium">{selectedPayment.transaction_reference || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-gray-600">Order Total</Label>
                <p className="font-medium">{formatUGX(selectedPayment.total_amount)}</p>
              </div>
              <div>
                <Label className="text-gray-600">Amount Paid</Label>
                <p className="font-medium text-green-600">{formatUGX(selectedPayment.amount_paid)}</p>
              </div>
              <div>
                <Label className="text-gray-600">Balance</Label>
                <p className="font-medium text-yellow-600">{formatUGX(selectedPayment.balance)}</p>
              </div>
              <div>
                <Label className="text-gray-600">Payment Status</Label>
                <div className="mt-1">{getStatusBadge(selectedPayment.payment_status)}</div>
              </div>
              <div>
                <Label className="text-gray-600">Received By</Label>
                <p className="font-medium">{selectedPayment.received_by}</p>
              </div>
            </div>
            <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => printPaymentReceipt(selectedPayment)}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print Receipt
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => openLinkedOrder(selectedPayment.order_number)}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Order
              </Button>
              {isAdmin && Number(selectedPayment.amount_paid) > 0 && (
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto"
                  onClick={() => setCancelPaymentTarget(selectedPayment)}
                >
                  Cancel Payment
                </Button>
              )}
              <Button onClick={() => setShowDetailsDialog(false)} className="w-full sm:w-auto">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancel Payment Confirmation (administrators only) */}
      <AlertDialog
        open={!!cancelPaymentTarget}
        onOpenChange={(open) => {
          if (!open) setCancelPaymentTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to cancel this payment?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {cancelPaymentTarget && (
                    <>
                      This will remove the payment of{' '}
                      <strong>{formatUGX(cancelPaymentTarget.amount_paid)}</strong> from order{' '}
                      <strong>{cancelPaymentTarget.order_number}</strong>.
                    </>
                  )}
                </p>
                <p>
                  The order balance and payment status will be recalculated automatically
                  (paid, partial or unpaid). This cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingPayment}>Keep payment</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancellingPayment}
              onClick={(event) => {
                event.preventDefault();
                handleCancelPayment();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancellingPayment ? 'Cancelling…' : 'OK, cancel payment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Payment Dialog */}
      {selectedPendingPayment && token && (
        <AssignPaymentDialog
          isOpen={showAssignDialog}
          onClose={() => {
            setShowAssignDialog(false);
            setSelectedPendingPayment(null);
          }}
          payment={selectedPendingPayment}
          token={token}
          onSuccess={() => {
            fetchPendingPayments();
            fetchPayments();
            toast.success('Payment assigned successfully');
          }}
        />
      )}
    </MainLayout>
  );
};

export default Payments;

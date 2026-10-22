import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import axios from 'axios';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  DollarSign,
  AlertTriangle,
  Info,
  Receipt,
  ShieldAlert,
  Wrench,
  Loader2,
} from 'lucide-react';

interface PaymentTransaction {
  id: number;
  amount: number;
  payment_method: string;
  transaction_reference: string | null;
  payment_date: string;
  is_refund: boolean;
  refund_reason: string | null;
  received_by: string;
  amount_refunded: number;
}

interface RefundDialogProps {
  open: boolean;
  onClose: () => void;
  order: {
    id: number;
    order_number: string;
    customer_name: string;
    customer_phone: string;
    total_amount: number;
    amount_paid: number;
    balance: number;
    payment_status: string;
    status: string;
  };
  onRefundProcessed?: () => void;
}

type RefundType = 'transaction' | 'order' | 'damage';

const REFUND_TYPE_INFO: Record<RefundType, { label: string; icon: React.ReactNode; description: string; color: string }> = {
  transaction: {
    label: 'Refund Specific Payment',
    icon: <Receipt className="h-4 w-4" />,
    description: 'Refund a specific payment transaction (e.g., duplicate payment, wrong amount)',
    color: 'text-blue-600',
  },
  order: {
    label: 'Order-Level Refund',
    icon: <ShieldAlert className="h-4 w-4" />,
    description: 'Refund a blanket amount against the entire order (full or partial cancellation)',
    color: 'text-orange-600',
  },
  damage: {
    label: 'Damage / Adjustment Refund',
    icon: <Wrench className="h-4 w-4" />,
    description: 'Partial refund for item damage or service issue. Order stays active.',
    color: 'text-purple-600',
  },
};

export function RefundDialog({ open, onClose, order, onRefundProcessed }: RefundDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);

  const [refundType, setRefundType] = useState<RefundType>('order');
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    refund_amount: '',
    refund_reason: '',
    payment_method: 'CASH',
    transaction_reference: '',
    notes: '',
    cancel_order: true,
  });

  // Calculate available for refund (simplified - backend does the real check)
  const availableForRefund = order.amount_paid;
  const isFullRefund = formData.refund_amount && parseFloat(formData.refund_amount) === availableForRefund;

  // Determine if user can process directly or needs to request
  const canProcessDirectly = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isDesktopAgent = user?.role === 'DESKTOP_AGENT';

  // Get the selected payment details
  const selectedPayment = payments.find((p) => p.id === selectedPaymentId);
  const selectedPaymentAvailable = selectedPayment
    ? selectedPayment.amount - selectedPayment.amount_refunded
    : 0;

  // Fetch payment transactions when dialog opens or refund type changes to 'transaction'
  useEffect(() => {
    if (open && refundType === 'transaction') {
      fetchPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refundType]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setRefundType('order');
      setSelectedPaymentId(null);
      setPayments([]);
      setFormData({
        refund_amount: '',
        refund_reason: '',
        payment_method: 'CASH',
        transaction_reference: '',
        notes: '',
        cancel_order: true,
      });
    }
  }, [open]);

  const fetchPayments = async () => {
    setLoadingPayments(true);
    try {
      const token = localStorage.getItem('hommiez_token');
      const response = await axios.get(
        `${API_BASE_URL}/payments/order/${order.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Only show actual payments (not refunds) that have some amount available
      const actualPayments = (response.data as PaymentTransaction[]).filter(
        (p) => !p.is_refund && p.amount > 0
      );
      setPayments(actualPayments);
    } catch (error) {
      console.error('Failed to fetch payments:', error);
      toast.error('Failed to load payment transactions');
    } finally {
      setLoadingPayments(false);
    }
  };

  const handleRefundTypeChange = (type: RefundType) => {
    setRefundType(type);
    setSelectedPaymentId(null);
    setFormData((prev) => ({
      ...prev,
      refund_amount: '',
      // Damage refunds never cancel
      cancel_order: type === 'damage' ? false : true,
    }));

    // Fetch payments if switching to transaction type
    if (type === 'transaction' && payments.length === 0) {
      fetchPayments();
    }
  };

  const handleSelectPayment = (paymentId: number) => {
    setSelectedPaymentId(paymentId);
    const payment = payments.find((p) => p.id === paymentId);
    if (payment) {
      const available = payment.amount - payment.amount_refunded;
      setFormData((prev) => ({
        ...prev,
        refund_amount: String(available),
        payment_method: payment.payment_method,
      }));
    }
  };

  const getMaxRefundAmount = (): number => {
    if (refundType === 'transaction' && selectedPayment) {
      return selectedPaymentAvailable;
    }
    return availableForRefund;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amount = parseFloat(formData.refund_amount);
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid refund amount');
      return;
    }

    if (!formData.refund_reason || formData.refund_reason.trim().length < 10) {
      toast.error('Refund reason must be at least 10 characters');
      return;
    }

    const maxAmount = getMaxRefundAmount();
    if (amount > maxAmount) {
      toast.error(`Refund amount cannot exceed ${formatUGX(maxAmount)}`);
      return;
    }

    if (refundType === 'transaction' && !selectedPaymentId) {
      toast.error('Please select a payment transaction to refund');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('hommiez_token');
      const refundData: Record<string, unknown> = {
        refund_amount: amount,
        refund_reason: formData.refund_reason,
        payment_method: formData.payment_method,
        transaction_reference: formData.transaction_reference || undefined,
        notes: formData.notes || undefined,
        cancel_order: refundType === 'damage' ? false : formData.cancel_order,
        refund_type: refundType,
      };

      // Add payment_id for per-transaction refunds
      if (refundType === 'transaction' && selectedPaymentId) {
        refundData.payment_id = selectedPaymentId;
      }

      if (canProcessDirectly) {
        // ADMIN/MANAGER: Process refund directly
        const response = await axios.post(
          `${API_BASE_URL}/payments/refund/${order.id}`,
          refundData,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const { message, order: orderChanges } = response.data;

        toast.success(message, {
          description: orderChanges.order_cancelled
            ? 'Order has been cancelled due to full refund'
            : `New balance: ${formatUGX(orderChanges.new_balance)}`,
        });

        if (user?.role === 'MANAGER') {
          toast.info('Admin has been notified of this refund', { duration: 5000 });
        }
      } else if (isDesktopAgent) {
        // DESKTOP_AGENT: Create refund request
        await axios.post(
          `${API_BASE_URL}/payments/refund-requests/${order.id}`,
          refundData,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        toast.success('Refund request submitted successfully', {
          description: 'Your request is pending admin approval. You will be notified once it is reviewed.',
          duration: 6000,
        });
      }

      onClose();
      if (onRefundProcessed) {
        onRefundProcessed();
      }
    } catch (error: unknown) {
      console.error('Refund error:', error);
      const err = error as { response?: { data?: { error?: string; message?: string } } };
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to process refund');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      refund_amount: '',
      refund_reason: '',
      payment_method: 'CASH',
      transaction_reference: '',
      notes: '',
      cancel_order: true,
    });
    setRefundType('order');
    setSelectedPaymentId(null);
    setPayments([]);
    onClose();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-UG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPaymentMethod = (method: string) => {
    const map: Record<string, string> = {
      CASH: 'Cash',
      MOBILE_MONEY_MTN: 'MTN MoMo',
      MOBILE_MONEY_AIRTEL: 'Airtel Money',
      BANK_TRANSFER: 'Bank Transfer',
    };
    return map[method] || method;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-[620px] max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-destructive" />
            {canProcessDirectly ? 'Process Refund' : 'Request Refund'}
          </DialogTitle>
          <DialogDescription>
            {canProcessDirectly
              ? 'Process a refund for this order. Choose a refund type below.'
              : 'Submit a refund request for admin approval.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Order Summary */}
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Order Number:</span>
              <span>{order.order_number}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium">Customer:</span>
              <span>{order.customer_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium">Total Amount:</span>
              <span>{formatUGX(order.total_amount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium">Amount Paid:</span>
              <span className="text-green-600 font-semibold">
                {formatUGX(order.amount_paid)}
              </span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="font-medium">Available for Refund:</span>
              <span className="text-blue-600 font-semibold">
                {formatUGX(availableForRefund)}
              </span>
            </div>
          </div>

          {/* Refund Type Selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Refund Type</Label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.entries(REFUND_TYPE_INFO) as [RefundType, typeof REFUND_TYPE_INFO['order']][]).map(
                ([type, info]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleRefundTypeChange(type)}
                    className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                      refundType === type
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
                    }`}
                  >
                    <div className={`mt-0.5 ${refundType === type ? 'text-primary' : info.color}`}>
                      {info.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{info.label}</span>
                        {refundType === type && (
                          <Badge variant="outline" className="text-xs">
                            Selected
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
                    </div>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Payment Transaction Selector (only for 'transaction' type) */}
          {refundType === 'transaction' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select Payment to Refund</Label>
              {loadingPayments ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading transactions...
                </div>
              ) : payments.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3 rounded-lg bg-muted">
                  No refundable payment transactions found for this order.
                </div>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto rounded-lg border p-2">
                  {payments.map((payment) => {
                    const available = payment.amount - payment.amount_refunded;
                    const isFullyRefunded = available <= 0;
                    return (
                      <button
                        key={payment.id}
                        type="button"
                        disabled={isFullyRefunded}
                        onClick={() => handleSelectPayment(payment.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-md border text-left transition-all ${
                          isFullyRefunded
                            ? 'opacity-50 cursor-not-allowed bg-muted/30'
                            : selectedPaymentId === payment.id
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">
                              {formatUGX(payment.amount)}
                            </span>
                            <Badge
                              variant={isFullyRefunded ? 'destructive' : 'secondary'}
                              className="text-xs"
                            >
                              {isFullyRefunded
                                ? 'Fully Refunded'
                                : payment.amount_refunded > 0
                                ? `${formatUGX(available)} left`
                                : 'Available'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{formatPaymentMethod(payment.payment_method)}</span>
                            <span>•</span>
                            <span>{formatDate(payment.payment_date)}</span>
                            {payment.transaction_reference && (
                              <>
                                <span>•</span>
                                <span>Ref: {payment.transaction_reference}</span>
                              </>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Received by: {payment.received_by || 'Unknown'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Warning for full refund (only for 'order' type) */}
          {refundType === 'order' && isFullRefund && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200 dark:bg-orange-950/30 dark:border-orange-800">
              <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
              <div className="text-sm text-orange-800 dark:text-orange-300">
                <p className="font-medium">Full Refund Detected</p>
                <p className="text-xs mt-1">
                  This refund will return all payments. The order will be automatically cancelled.
                </p>
              </div>
            </div>
          )}

          {/* Damage type info */}
          {refundType === 'damage' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-purple-50 border border-purple-200 dark:bg-purple-950/30 dark:border-purple-800">
              <Wrench className="h-5 w-5 text-purple-600 mt-0.5" />
              <div className="text-sm text-purple-800 dark:text-purple-300">
                <p className="font-medium">Damage / Adjustment Refund</p>
                <p className="text-xs mt-1">
                  The order will remain active. This refund is an adjustment for damaged items or
                  service issues — the order is not cancelled.
                </p>
              </div>
            </div>
          )}

          {/* Refund Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Refund Amount */}
            <div className="space-y-2">
              <Label htmlFor="refund_amount">
                Refund Amount <span className="text-destructive">*</span>
              </Label>
              <Input
                id="refund_amount"
                type="number"
                min="1"
                max={getMaxRefundAmount()}
                step="1"
                placeholder="Enter amount to refund"
                value={formData.refund_amount}
                onChange={(e) => setFormData({ ...formData, refund_amount: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Maximum: {formatUGX(getMaxRefundAmount())}
                {refundType === 'transaction' && selectedPayment && (
                  <span>
                    {' '}(from payment #{selectedPayment.id} of{' '}
                    {formatUGX(selectedPayment.amount)})
                  </span>
                )}
              </p>
            </div>

            {/* Refund Reason */}
            <div className="space-y-2">
              <Label htmlFor="refund_reason">
                Refund Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="refund_reason"
                placeholder={
                  refundType === 'transaction'
                    ? 'e.g., Duplicate payment made via MTN MoMo...'
                    : refundType === 'damage'
                    ? 'e.g., Customer clothes damaged during processing...'
                    : 'Explain why this refund is being processed (minimum 10 characters)'
                }
                value={formData.refund_reason}
                onChange={(e) => setFormData({ ...formData, refund_reason: e.target.value })}
                required
                minLength={10}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {formData.refund_reason.length}/10 characters minimum
              </p>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label htmlFor="payment_method">Refund Method</Label>
              <Select
                value={formData.payment_method}
                onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="MOBILE_MONEY_MTN">Mobile Money (MTN)</SelectItem>
                  <SelectItem value="MOBILE_MONEY_AIRTEL">Mobile Money (Airtel)</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Transaction Reference */}
            {formData.payment_method !== 'CASH' && (
              <div className="space-y-2">
                <Label htmlFor="transaction_reference">Transaction Reference (Optional)</Label>
                <Input
                  id="transaction_reference"
                  placeholder="e.g., MTN ref: 12345678"
                  value={formData.transaction_reference}
                  onChange={(e) =>
                    setFormData({ ...formData, transaction_reference: e.target.value })
                  }
                />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any additional information about this refund"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
              />
            </div>

            {/* Cancel Order Checkbox (only for 'order' type full refunds) */}
            {refundType === 'order' && isFullRefund && (
              <div className="flex items-start space-x-2 p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
                <Checkbox
                  id="cancel_order"
                  checked={formData.cancel_order}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, cancel_order: checked === true })
                  }
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="cancel_order"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Automatically cancel order
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Since this is a full refund, the order will be cancelled automatically. Uncheck
                    only if you want to keep the order active.
                  </p>
                </div>
              </div>
            )}

            {/* Info for Desktop Agent */}
            {isDesktopAgent && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
                <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-300">
                  <p className="font-medium">Approval Required</p>
                  <p className="text-xs mt-1">
                    As a Desktop Agent, your refund request will be sent to an administrator for
                    approval. You will be notified once it is reviewed.
                  </p>
                </div>
              </div>
            )}

            {/* Manager Info */}
            {user?.role === 'MANAGER' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800">
                <Info className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800 dark:text-yellow-300">
                  <p className="font-medium">Admin Notification</p>
                  <p className="text-xs mt-1">
                    This refund will be processed immediately, and the administrator will be
                    notified for audit purposes.
                  </p>
                </div>
              </div>
            )}
          </form>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || (refundType === 'transaction' && !selectedPaymentId)}
            variant="destructive"
            className="w-full sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing...
              </>
            ) : canProcessDirectly ? (
              'Process Refund'
            ) : (
              'Submit Request'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

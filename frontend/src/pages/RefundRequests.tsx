import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { MainLayout } from '@/components/layout/MainLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  ClipboardList, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  DollarSign,
  User,
  Calendar,
  AlertTriangle,
  FileText,
  Receipt,
  ShieldAlert,
  Wrench
} from 'lucide-react';

interface RefundRequest {
  id: number;
  order_id: number;
  order_number: string;
  requested_amount: number;
  refund_reason: string;
  payment_method: string;
  transaction_reference: string | null;
  notes: string | null;
  status: string;
  requested_at: string;
  cancel_order: boolean;
  requested_by_email: string;
  requested_by_name: string;
  requested_by_role: string;
  order_total: number;
  order_amount_paid: number;
  order_balance: number;
  order_payment_status: string;
  order_status: string;
  customer_name: string;
  customer_phone: string;
  available_for_refund: number;
  is_valid_amount: boolean;
  refund_type: 'transaction' | 'order' | 'damage';
  target_payment_id: number | null;
  target_payment_amount: number | null;
  target_payment_method: string | null;
  target_payment_date: string | null;
  target_payment_reference: string | null;
  target_payment_available: number | null;
}

export function RefundRequestsManager() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<RefundRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [highlightedRequestId, setHighlightedRequestId] = useState<number | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  // Deep-link: auto-open specific refund request from notification
  useEffect(() => {
    if (deepLinkHandled.current || loading || requests.length === 0) return;
    const requestIdParam = searchParams.get('requestId');
    if (!requestIdParam) return;

    deepLinkHandled.current = true;
    const targetId = parseInt(requestIdParam, 10);
    const targetRequest = requests.find(r => r.id === targetId);

    if (targetRequest) {
      setHighlightedRequestId(targetId);
      setSelectedRequest(targetRequest);
      setActionType('approve');
      // Clear the query param so refreshing doesn't re-trigger
      setSearchParams({}, { replace: true });
      // Scroll to row after render
      setTimeout(() => {
        highlightedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    } else {
      // Request may already be processed — clear param and show toast
      setSearchParams({}, { replace: true });
      toast.info('This refund request may have already been reviewed or is no longer pending.');
    }
  }, [loading, requests, searchParams, setSearchParams]);

  const fetchPendingRequests = async () => {
    try {
      const token = localStorage.getItem('hommiez_token');
      const response = await axios.get(
        `${API_BASE_URL}/payments/refund-requests/pending`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setRequests(response.data.requests);
    } catch (error: unknown) {
      console.error('Fetch refund requests error:', error);
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to fetch refund requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;

    setProcessing(true);
    try {
      const token = localStorage.getItem('hommiez_token');
      const response = await axios.post(
        `${API_BASE_URL}/payments/refund-requests/${selectedRequest.id}/approve`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success('Refund request approved', {
        description: response.data.message,
      });

      setSelectedRequest(null);
      setActionType(null);
      fetchPendingRequests();
    } catch (error: unknown) {
      console.error('Approve refund request error:', error);
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to approve refund request');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectionReason || rejectionReason.trim().length < 10) {
      toast.error('Rejection reason must be at least 10 characters');
      return;
    }

    setProcessing(true);
    try {
      const token = localStorage.getItem('hommiez_token');
      await axios.post(
        `${API_BASE_URL}/payments/refund-requests/${selectedRequest.id}/reject`,
        { rejection_reason: rejectionReason },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success('Refund request rejected', {
        description: 'The requester will be notified',
      });

      setSelectedRequest(null);
      setActionType(null);
      setRejectionReason('');
      fetchPendingRequests();
    } catch (error: unknown) {
      console.error('Reject refund request error:', error);
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to reject refund request');
    } finally {
      setProcessing(false);
    }
  };

  const openApprovalDialog = (request: RefundRequest) => {
    setSelectedRequest(request);
    setActionType('approve');
  };

  const openRejectionDialog = (request: RefundRequest) => {
    setSelectedRequest(request);
    setActionType('reject');
    setRejectionReason('');
  };

  const closeDialog = () => {
    setSelectedRequest(null);
    setActionType(null);
    setRejectionReason('');
  };

  if (user?.role !== 'ADMIN') {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">Only administrators can view refund requests</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Refund Requests</h1>
          <p className="text-muted-foreground mt-1">
            Review and approve/reject refund requests from desktop agents
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Pending Requests ({requests.length})
          </CardTitle>
          <CardDescription>
            Review refund requests and approve or reject them
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin text-4xl">⏳</div>
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No pending refund requests</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Valid</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow
                      key={request.id}
                      ref={request.id === highlightedRequestId ? highlightedRowRef : undefined}
                      className={request.id === highlightedRequestId ? 'bg-yellow-100 dark:bg-yellow-900/30 ring-2 ring-yellow-400 animate-pulse' : ''}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{request.order_number}</div>
                          <div className="text-xs text-muted-foreground">
                            {request.order_status.toUpperCase()}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {request.refund_type === 'transaction' && (
                            <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-300">
                              <Receipt className="h-3 w-3" />
                              Payment
                            </Badge>
                          )}
                          {request.refund_type === 'order' && (
                            <Badge variant="outline" className="text-xs gap-1 text-orange-600 border-orange-300">
                              <ShieldAlert className="h-3 w-3" />
                              Order
                            </Badge>
                          )}
                          {request.refund_type === 'damage' && (
                            <Badge variant="outline" className="text-xs gap-1 text-purple-600 border-purple-300">
                              <Wrench className="h-3 w-3" />
                              Damage
                            </Badge>
                          )}
                          {request.target_payment_id && (
                            <span className="text-xs text-muted-foreground">#{request.target_payment_id}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{request.customer_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {request.customer_phone}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{request.requested_by_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {request.requested_by_role}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-semibold text-destructive">
                            {formatUGX(request.requested_amount)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Available: {formatUGX(request.available_for_refund)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate" title={request.refund_reason}>
                          {request.refund_reason}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(request.requested_at).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(request.requested_at).toLocaleTimeString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        {request.is_valid_amount ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Valid
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Invalid
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => openApprovalDialog(request)}
                            disabled={!request.is_valid_amount}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => openRejectionDialog(request)}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
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

      {/* Approval Dialog */}
      <Dialog open={actionType === 'approve'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Approve Refund Request
            </DialogTitle>
            <DialogDescription>
              Review the details and confirm to approve this refund request
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Order Number</Label>
                  <div className="font-medium">{selectedRequest.order_number}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Customer</Label>
                  <div className="font-medium">{selectedRequest.customer_name}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Refund Amount</Label>
                  <div className="font-semibold text-destructive">
                    {formatUGX(selectedRequest.requested_amount)}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Payment Method</Label>
                  <div className="font-medium">{selectedRequest.payment_method}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Refund Type</Label>
                  <div className="font-medium flex items-center gap-1.5">
                    {selectedRequest.refund_type === 'transaction' && <><Receipt className="h-3.5 w-3.5 text-blue-600" /> Specific Payment</>}
                    {selectedRequest.refund_type === 'order' && <><ShieldAlert className="h-3.5 w-3.5 text-orange-600" /> Order-Level</>}
                    {selectedRequest.refund_type === 'damage' && <><Wrench className="h-3.5 w-3.5 text-purple-600" /> Damage/Adjustment</>}
                  </div>
                </div>
                {selectedRequest.target_payment_id && (
                  <div>
                    <Label className="text-muted-foreground">Target Payment</Label>
                    <div className="font-medium">
                      #{selectedRequest.target_payment_id} — {formatUGX(selectedRequest.target_payment_amount)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedRequest.target_payment_method}
                      {selectedRequest.target_payment_date && ` • ${new Date(selectedRequest.target_payment_date).toLocaleDateString()}`}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-muted-foreground">Refund Reason</Label>
                <div className="mt-1 p-3 rounded-lg bg-muted">
                  {selectedRequest.refund_reason}
                </div>
              </div>

              {selectedRequest.notes && (
                <div>
                  <Label className="text-muted-foreground">Additional Notes</Label>
                  <div className="mt-1 p-3 rounded-lg bg-muted">
                    {selectedRequest.notes}
                  </div>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground">Requested By</Label>
                <div className="font-medium">
                  {selectedRequest.requested_by_name} ({selectedRequest.requested_by_role})
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedRequest.requested_by_email}
                </div>
              </div>

              {selectedRequest.refund_type === 'damage' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-purple-50 border border-purple-200 dark:bg-purple-950/30 dark:border-purple-800">
                  <Wrench className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div className="text-sm text-purple-800 dark:text-purple-300">
                    <p className="font-medium">Damage/Adjustment Refund</p>
                    <p className="text-xs mt-1">
                      The order will remain active after approval. This is a partial adjustment.
                    </p>
                  </div>
                </div>
              )}

              {selectedRequest.refund_type !== 'damage' && selectedRequest.requested_amount === selectedRequest.available_for_refund && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200 dark:bg-orange-950/30 dark:border-orange-800">
                  <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div className="text-sm text-orange-800 dark:text-orange-300">
                    <p className="font-medium">Full Refund - Order Will Be Cancelled</p>
                    <p className="text-xs mt-1">
                      This is a full refund. The order will be automatically cancelled upon approval.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={processing}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={processing}
              className="bg-green-600 hover:bg-green-700"
            >
              {processing ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve Refund
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={actionType === 'reject'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Reject Refund Request
            </DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this refund request
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Order:</span>
                  <span>{selectedRequest.order_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Customer:</span>
                  <span>{selectedRequest.customer_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Amount:</span>
                  <span className="text-destructive font-semibold">
                    {formatUGX(selectedRequest.requested_amount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Requested By:</span>
                  <span>{selectedRequest.requested_by_name}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rejection_reason">
                  Rejection Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="rejection_reason"
                  placeholder="Explain why this refund request is being rejected (minimum 10 characters)"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  required
                  minLength={10}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  {rejectionReason.length}/10 characters minimum
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={handleReject} disabled={processing} variant="destructive">
              {processing ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </MainLayout>
  );
}

export default RefundRequestsManager;

import { MainLayout } from '@/components/layout/MainLayout';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Truck, Calendar, CheckCircle, XCircle, Clock, MapPin, User, Phone, Package, DollarSign, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';

interface DeliveryStats {
  pending: number;
  assigned: number;
  in_transit: number;
  delivered: number;
  failed: number;
  cancelled: number;
  paid_deliveries: number;
  free_deliveries: number;
  total_delivery_revenue: number;
}

interface Delivery {
  id: number;
  order_number: string;
  order_status: string;
  customer_name: string;
  customer_phone: string;
  delivery_type: 'PAID' | 'FREE';
  delivery_revenue: number;
  scheduled_date: string;
  scheduled_time_slot: string;
  delivery_status: string;
  driver_id: number | null;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_type: string | null;
  vehicle_number: string | null;
  delivery_person_name: string | null;
  vehicle_info: string | null;
  delivery_address: string | null;
  zone_name: string | null;
  zone_code: string | null;
  delivery_cost: number;
  delivery_notes: string | null;
  failed_reason: string | null;
  payment_amount: number;
  payment_method: string | null;
  payment_status: string;
  payment_notes: string | null;
  delivered_at: string | null;
  created_at: string;
}

interface DeliveryDriver {
  id: number;
  name: string;
  phone: string;
  vehicle_type: string;
  vehicle_number: string;
  total_deliveries: number;
  rating: number;
  status: string;
}

export default function Deliveries() {
  const { token } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<DeliveryStats>({
    pending: 0,
    assigned: 0,
    in_transit: 0,
    delivered: 0,
    failed: 0,
    cancelled: 0,
    paid_deliveries: 0,
    free_deliveries: 0,
    total_delivery_revenue: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('today');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  
  // Driver assignment dialog
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<DeliveryDriver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  
  // Status update dialog
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [failedReason, setFailedReason] = useState('');
  const [updating, setUpdating] = useState(false);

  // Payment recording dialog
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentStatus, setPaymentStatus] = useState('PAID');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const recordingPaymentRef = useRef(false);

  // Detail dialog
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  // Highlighted delivery row (after deep-link navigation)
  const [highlightedDeliveryId, setHighlightedDeliveryId] = useState<number | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  // Deep-link support: ?orderId=X or ?deliveryId=X
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkOrderId = searchParams.get('orderId');
  const deepLinkDeliveryId = searchParams.get('deliveryId');

  const fetchDeliveries = React.useCallback(async () => {
    try {
      setLoading(true);
      let url = `${API_BASE_URL}/deliveries`;
      
      // Build query params based on date range selection
      const params = new URLSearchParams();
      
      if (dateRange === 'all') {
        // No date filter for all time
      } else if (fromDate && toDate) {
        params.append('from_date', fromDate);
        params.append('to_date', toDate);
      } else {
        params.append('date', selectedDate);
      }
      
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeliveries(response.data.deliveries || []);
    } catch (error) {
      console.error('Failed to fetch deliveries:', error);
    } finally {
      setLoading(false);
    }
  }, [token, selectedDate, dateRange, fromDate, toDate]);

  const fetchStats = React.useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/deliveries/stats?date=${selectedDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, [token, selectedDate]);

  useEffect(() => {
    fetchDeliveries();
    fetchStats();
  }, [fetchDeliveries, fetchStats]);

  // Deep-link: auto-find and open a specific delivery when navigated with ?orderId= or ?deliveryId=
  useEffect(() => {
    if (!deepLinkOrderId && !deepLinkDeliveryId) return;
    if (loading) return;

    // If we already have deliveries loaded, try to find the target
    let target: Delivery | undefined;
    if (deepLinkDeliveryId) {
      target = deliveries.find(d => d.id === parseInt(deepLinkDeliveryId));
    } else if (deepLinkOrderId) {
      // Order number is formatted, but we might have the raw order_id
      // Try matching by order_number containing the ID or exact match
      target = deliveries.find(d => {
        // The orderId param is the order's DB id — match via order_number pattern or fetch by API
        return d.order_number === deepLinkOrderId || d.order_number.includes(deepLinkOrderId!);
      });
    }

    if (target) {
      // Found it — open detail dialog and mark for highlight
      setSelectedDelivery(target);
      setHighlightedDeliveryId(target.id);
      setShowDetailDialog(true);
      // Clear the search params so it doesn't re-trigger
      setSearchParams({}, { replace: true });
    } else if (dateRange !== 'all') {
      // Not found in current range — switch to "All Time" to cast wider net
      handleDateRangeChange('all');
    } else {
      // Already on 'all' and still not found — try fetching by order ID via API
      if (deepLinkOrderId) {
        const fetchSpecificDelivery = async () => {
          try {
            const response = await axios.get(
              `${API_BASE_URL}/deliveries/order/${deepLinkOrderId}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (response.data.delivery) {
              const del = response.data.delivery;
              // Map to Delivery interface shape
              const mapped: Delivery = {
                id: del.id,
                order_number: del.order_number || `ORD-${deepLinkOrderId}`,
                order_status: del.order_status || '',
                customer_name: del.customer_name || '',
                customer_phone: del.customer_phone || '',
                delivery_type: del.delivery_type,
                delivery_revenue: del.delivery_revenue || 0,
                scheduled_date: del.scheduled_date || del.created_at,
                scheduled_time_slot: del.scheduled_time_slot || '',
                delivery_status: del.delivery_status,
                driver_id: del.driver_id || null,
                driver_name: del.driver_name || null,
                driver_phone: del.driver_phone || null,
                vehicle_type: del.vehicle_type || null,
                vehicle_number: del.vehicle_number || null,
                delivery_person_name: del.delivery_person_name || null,
                vehicle_info: del.vehicle_info || null,
                delivery_address: del.delivery_address || null,
                zone_name: del.zone_name || null,
                zone_code: del.zone_code || null,
                delivery_cost: del.delivery_cost || del.delivery_revenue || 0,
                delivery_notes: del.delivery_notes || null,
                failed_reason: del.failed_reason || null,
                payment_amount: del.payment_amount || 0,
                payment_method: del.payment_method || null,
                payment_status: del.payment_status || '',
                payment_notes: del.payment_notes || null,
                delivered_at: del.delivered_at || null,
                created_at: del.created_at || '',
              };
              setSelectedDelivery(mapped);
              setHighlightedDeliveryId(mapped.id);
              setShowDetailDialog(true);
            } else {
              toast({ title: 'Delivery not found', description: 'No delivery exists for this order.', variant: 'destructive' });
            }
          } catch {
            toast({ title: 'Delivery not found', description: 'Could not find a delivery for this order.', variant: 'destructive' });
          }
          setSearchParams({}, { replace: true });
        };
        fetchSpecificDelivery();
      } else {
        setSearchParams({}, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkOrderId, deepLinkDeliveryId, deliveries, loading, dateRange]);

  // Scroll to highlighted row when detail dialog closes, and clear highlight on scroll
  const handleDetailDialogClose = useCallback((open: boolean) => {
    setShowDetailDialog(open);
    if (!open && highlightedDeliveryId) {
      // After dialog closes, scroll the highlighted row into view
      setTimeout(() => {
        highlightedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [highlightedDeliveryId]);

  // Clear highlight on scroll
  useEffect(() => {
    if (!highlightedDeliveryId) return;
    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      // Only clear after the auto-scroll has settled (wait 1.5s)
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setHighlightedDeliveryId(null);
      }, 600);
    };

    // Delay attaching the listener so the auto-scroll doesn't immediately clear it
    const attachTimeout = setTimeout(() => {
      window.addEventListener('scroll', handleScroll, true);
    }, 1200);

    return () => {
      clearTimeout(attachTimeout);
      clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [highlightedDeliveryId]);
  
  // Handle date range changes
  const handleDateRangeChange = (range: 'today' | 'yesterday' | 'week' | 'month' | 'all') => {
    setDateRange(range);
    const today = new Date();
    
    switch (range) {
      case 'today':
        setSelectedDate(today.toISOString().split('T')[0]);
        setFromDate('');
        setToDate('');
        break;
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        setSelectedDate(yesterday.toISOString().split('T')[0]);
        setFromDate('');
        setToDate('');
        break;
      }
      case 'week': {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
        setFromDate(weekStart.toISOString().split('T')[0]);
        setToDate(today.toISOString().split('T')[0]);
        break;
      }
      case 'month': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        setFromDate(monthStart.toISOString().split('T')[0]);
        setToDate(today.toISOString().split('T')[0]);
        break;
      }
      case 'all':
        setFromDate('');
        setToDate('');
        break;
    }
  };
  
  const fetchAvailableDrivers = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/deliveries/drivers/available`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAvailableDrivers(response.data.drivers || []);
    } catch (error) {
      console.error('Failed to fetch drivers:', error);
    }
  };

  const openAssignDialog = (delivery: Delivery) => {
    setSelectedDelivery(delivery);
    setSelectedDriver(delivery.delivery_person_name || delivery.driver_name || '');
    setShowAssignDialog(true);
  };

  const handleAssignDriver = async () => {
    if (!selectedDelivery || !selectedDriver) return;
    
    try {
      setAssigning(true);
      await axios.put(
        `${API_BASE_URL}/deliveries/${selectedDelivery.id}/person`,
        { 
          delivery_person_name: selectedDriver,
          vehicle_info: selectedDelivery.vehicle_info || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast({
        title: 'Delivery Person Set',
        description: 'Delivery person has been updated successfully',
      });
      
      setShowAssignDialog(false);
      fetchDeliveries();
      fetchStats();
      fetchStats();
    } catch (error) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast({
        variant: 'destructive',
        title: 'Assignment Failed',
        description: axiosError.response?.data?.error || 'Failed to assign driver',
      });
    } finally {
      setAssigning(false);
    }
  };

  const openStatusDialog = (delivery: Delivery, status: string) => {
    setSelectedDelivery(delivery);
    setNewStatus(status);
    setFailedReason('');
    setShowStatusDialog(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedDelivery || !newStatus) return;
    
    try {
      setUpdating(true);
      const payload: { status: string; failed_reason?: string } = { status: newStatus };
      
      if (newStatus === 'FAILED' && failedReason) {
        payload.failed_reason = failedReason;
      }
      
      await axios.put(
        `${API_BASE_URL}/deliveries/${selectedDelivery.id}/status`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast({
        title: 'Status Updated',
        description: `Delivery marked as ${newStatus.toLowerCase().replace('_', ' ')}`,
      });
      
      setShowStatusDialog(false);
      fetchDeliveries();
      fetchStats();
    } catch (error) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: axiosError.response?.data?.error || 'Failed to update status',
      });
    } finally {
      setUpdating(false);
    }
  };

  const openPaymentDialog = (delivery: Delivery) => {
    setSelectedDelivery(delivery);
    // Only pre-fill if payment was already recorded, otherwise start empty for manual entry
    setPaymentAmount(delivery.payment_amount > 0 ? delivery.payment_amount.toString() : '');
    setPaymentMethod(delivery.payment_method || 'CASH');
    setPaymentStatus(delivery.payment_status || 'PAID');
    setPaymentNotes(delivery.payment_notes || '');
    setShowPaymentDialog(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedDelivery || recordingPaymentRef.current || recordingPayment) return;

    recordingPaymentRef.current = true;
    setRecordingPayment(true);

    try {
      await axios.put(
        `${API_BASE_URL}/deliveries/${selectedDelivery.id}/payment`,
        {
          payment_amount: parseFloat(paymentAmount),
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          payment_notes: paymentNotes || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast({
        title: 'Payment Recorded',
        description: `Payment of ${formatCurrency(parseFloat(paymentAmount))} recorded successfully`,
      });
      
      setShowPaymentDialog(false);
      fetchDeliveries();
      fetchStats();
    } catch (error) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast({
        variant: 'destructive',
        title: 'Recording Failed',
        description: axiosError.response?.data?.error || 'Failed to record payment',
      });
    } finally {
      recordingPaymentRef.current = false;
      setRecordingPayment(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
      DELIVERED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
      CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatCurrency = (amount: number) => {
    return formatUGX(amount);
  };

  return (
    <MainLayout title="Deliveries" subtitle="Manage pickup and delivery schedules for Kampala & surrounding areas">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending || 0}</div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.delivered || 0}</div>
            <p className="text-xs text-muted-foreground">Delivered</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{stats.cancelled || 0}</div>
            <p className="text-xs text-muted-foreground">Cancelled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-bold text-purple-600">{formatCurrency(stats.total_delivery_revenue || 0)}</div>
            <p className="text-xs text-muted-foreground">Revenue</p>
          </CardContent>
        </Card>
      </div>

      {/* Date Range Filter */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 mb-3">
          <label className="text-sm font-medium">View:</label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={dateRange === 'today' ? 'default' : 'outline'}
              onClick={() => handleDateRangeChange('today')}
            >
              Today
            </Button>
            <Button
              size="sm"
              variant={dateRange === 'yesterday' ? 'default' : 'outline'}
              onClick={() => handleDateRangeChange('yesterday')}
            >
              Yesterday
            </Button>
            <Button
              size="sm"
              variant={dateRange === 'week' ? 'default' : 'outline'}
              onClick={() => handleDateRangeChange('week')}
            >
              This Week
            </Button>
            <Button
              size="sm"
              variant={dateRange === 'month' ? 'default' : 'outline'}
              onClick={() => handleDateRangeChange('month')}
            >
              This Month
            </Button>
            <Button
              size="sm"
              variant={dateRange === 'all' ? 'default' : 'outline'}
              onClick={() => handleDateRangeChange('all')}
            >
              All Time
            </Button>
          </div>
        </div>
        
        {/* Show date range details */}
        <div className="text-sm text-muted-foreground">
          {dateRange === 'today' && `Showing deliveries for ${new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
          {dateRange === 'yesterday' && `Showing deliveries for ${new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
          {dateRange === 'week' && `Showing deliveries from ${new Date(fromDate).toLocaleDateString('en-GB')} to ${new Date(toDate).toLocaleDateString('en-GB')}`}
          {dateRange === 'month' && `Showing deliveries from ${new Date(fromDate).toLocaleDateString('en-GB')} to ${new Date(toDate).toLocaleDateString('en-GB')}`}
          {dateRange === 'all' && 'Showing all deliveries'}
        </div>
      </div>

      {/* Deliveries Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {dateRange === 'all' ? 'All Deliveries' : 
             dateRange === 'week' ? 'This Week\'s Deliveries' :
             dateRange === 'month' ? 'This Month\'s Deliveries' :
             `Deliveries - ${dateRange === 'today' ? 'Today' : 'Yesterday'}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading deliveries...</div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No deliveries scheduled for this date</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1000px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Order</TableHead>
                    <TableHead className="whitespace-nowrap">Customer</TableHead>
                    <TableHead className="whitespace-nowrap">Type</TableHead>
                    <TableHead className="whitespace-nowrap">Zone/Address</TableHead>
                    <TableHead className="whitespace-nowrap">Time Slot</TableHead>
                    <TableHead className="whitespace-nowrap">Driver</TableHead>
                    <TableHead className="whitespace-nowrap">Cost</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((delivery) => (
                    <TableRow
                      key={delivery.id}
                      ref={delivery.id === highlightedDeliveryId ? highlightedRowRef : undefined}
                      className={`cursor-pointer hover:bg-muted/50 transition-all duration-500 ${
                        delivery.id === highlightedDeliveryId
                          ? 'bg-purple-100 dark:bg-purple-900/40 ring-2 ring-purple-400 dark:ring-purple-600 ring-inset animate-pulse'
                          : ''
                      }`}
                      onClick={() => { setSelectedDelivery(delivery); setShowDetailDialog(true); }}
                    >
                      <TableCell className="font-medium">
                        <div>{delivery.order_number}</div>
                        <Badge variant="outline" className="text-xs mt-1">
                          {delivery.order_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{delivery.customer_name}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{delivery.customer_phone}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          delivery.delivery_type === 'PAID' 
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                        }>
                          {delivery.delivery_type === 'PAID' ? '💰 PAID' : '🎁 FREE'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-1 font-medium text-sm">
                            <MapPin className="h-3 w-3" />
                            {delivery.zone_name || 'N/A'}
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {delivery.delivery_address || 'No address'}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3" />
                          {delivery.scheduled_time_slot || 'Not set'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {delivery.delivery_person_name || delivery.driver_name ? (
                          <div>
                            <div className="font-medium text-sm">
                              {delivery.delivery_person_name || delivery.driver_name}
                            </div>
                            {(delivery.vehicle_info || delivery.vehicle_type) && (
                              <div className="text-xs text-muted-foreground">
                                {delivery.vehicle_info || `${delivery.vehicle_type} - ${delivery.vehicle_number}`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not assigned</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {delivery.delivery_type === 'PAID' ? (
                          <div className="font-semibold text-green-600 dark:text-green-400">
                            💰 {formatCurrency(delivery.delivery_revenue || 0)}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Free (Offer)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(delivery.delivery_status)}>
                          {delivery.delivery_status}
                        </Badge>
                        {delivery.failed_reason && (
                          <div className="text-xs text-red-600 mt-1">
                            Reason: {delivery.failed_reason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 flex-wrap">
                          {/* Set/Edit Delivery Person button for PENDING deliveries */}
                          {delivery.delivery_status === 'PENDING' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => openAssignDialog(delivery)}
                            >
                              {delivery.delivery_person_name || delivery.driver_name ? 'Edit Person' : 'Set Person'}
                            </Button>
                          )}
                          
                          {/* Quick Complete button for PENDING deliveries */}
                          {delivery.delivery_status === 'PENDING' && (
                            <Button 
                              size="sm" 
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => openStatusDialog(delivery, 'DELIVERED')}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Complete
                            </Button>
                          )}
                          
                          {/* Cancel button for PENDING deliveries */}
                          {delivery.delivery_status === 'PENDING' && (
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => openStatusDialog(delivery, 'CANCELLED')}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Cancel
                            </Button>
                          )}
                          
                          {/* Manual status update button for all statuses */}
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedDelivery(delivery);
                              setNewStatus(delivery.delivery_status);
                              setShowStatusDialog(true);
                            }}
                            title="Manually change delivery status"
                          >
                            🔄 Status
                          </Button>

                          {/* View Details button */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-purple-300 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900"
                            onClick={() => {
                              setSelectedDelivery(delivery);
                              setShowDetailDialog(true);
                            }}
                            title="View full delivery details"
                          >
                            <Package className="h-3 w-3 mr-1" />
                            Details
                          </Button>
                          
                          {/* View Order button */}
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              navigate('/orders', { state: { searchOrderNumber: delivery.order_number } });
                            }}
                            title="View order details"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Order
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

      {/* Set Delivery Person Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Set Delivery Person / Rider</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedDelivery && (
              <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg space-y-1">
                <div className="font-medium">Order: {selectedDelivery.order_number}</div>
                <div className="text-sm">Customer: {selectedDelivery.customer_name}</div>
                <div className="text-sm">Zone: {selectedDelivery.zone_name || 'N/A'}</div>
                <div className="text-sm">Time: {selectedDelivery.scheduled_time_slot || 'Not set'}</div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Person Responsible for Delivery</Label>
              <Input
                placeholder="e.g., John, Mary, Rider name..."
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter the name of the person who will handle this delivery
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Vehicle Info (Optional)</Label>
              <Input
                placeholder="e.g., Motorcycle UBD 234K, Van, Bodaboda..."
                value={selectedDelivery?.vehicle_info || ''}
                onChange={(e) => {
                  if (selectedDelivery) {
                    setSelectedDelivery({...selectedDelivery, vehicle_info: e.target.value});
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Enter vehicle type or registration number
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowAssignDialog(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button 
              onClick={handleAssignDriver} 
              disabled={!selectedDriver || assigning}
              className="w-full sm:w-auto"
            >
              {assigning ? 'Saving...' : 'Save Delivery Person'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Update Delivery Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedDelivery && (
              <>
                <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg space-y-1">
                  <div className="font-medium">Order: {selectedDelivery.order_number}</div>
                  <div className="text-sm">Customer: {selectedDelivery.customer_name}</div>
                  <div className="text-sm">Rider: {selectedDelivery.delivery_person_name || selectedDelivery.driver_name || 'Not assigned'}</div>
                  <div className="text-sm">Current Status: <Badge className={getStatusColor(selectedDelivery.delivery_status)}>{selectedDelivery.delivery_status}</Badge></div>
                </div>

                {/* Status Selector */}
                <div className="space-y-2">
                  <Label>New Status</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select new status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">⏳ Pending</SelectItem>
                      <SelectItem value="DELIVERED">✅ Delivered</SelectItem>
                      <SelectItem value="CANCELLED">🚫 Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            
            {newStatus === 'CANCELLED' && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                  ⚠️ Cancelling delivery
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1 break-words">
                  • Order will be reverted to 'ready' status<br/>
                  {selectedDelivery && selectedDelivery.delivery_type === 'PAID' && `• Delivery revenue of ${formatUGX(selectedDelivery.delivery_revenue || 0)} will be refunded`}<br/>
                  • You can still manually mark the order as 'delivered' if customer picked up
                </p>
              </div>
            )}
            
            {newStatus === 'DELIVERED' && selectedDelivery && (
              <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  ✅ Marking delivery as completed
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-1 break-words">
                  • Order will be marked as 'delivered'<br/>
                  • Pickup date will be set to current timestamp<br/>
                  {selectedDelivery.delivery_type === 'PAID' && `• Revenue of ${formatUGX(selectedDelivery.delivery_revenue || 0)} will be recorded`}
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowStatusDialog(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateStatus} 
              disabled={updating || (newStatus === 'FAILED' && !failedReason)}
              className={`w-full sm:w-auto ${newStatus === 'DELIVERED' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
            >
              {updating ? 'Updating...' : `Confirm ${newStatus}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={handleDetailDialogClose}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-purple-600" />
              Delivery Details
            </DialogTitle>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4">
              {/* Order & Customer */}
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg space-y-2">
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-sm text-muted-foreground">Order</span>
                  <span className="font-semibold">{selectedDelivery.order_number}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-sm text-muted-foreground">Customer</span>
                  <span className="font-medium break-words">{selectedDelivery.customer_name}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-sm text-muted-foreground">Phone</span>
                  <span className="font-medium break-words">{selectedDelivery.customer_phone}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-sm text-muted-foreground">Order Status</span>
                  <Badge variant="outline">{selectedDelivery.order_status}</Badge>
                </div>
              </div>

              {/* Delivery Info */}
              <div className="bg-purple-50 dark:bg-purple-950 p-4 rounded-lg space-y-2 border border-purple-200 dark:border-purple-800">
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-sm text-muted-foreground">Delivery Type</span>
                  <Badge variant="outline" className={selectedDelivery.delivery_type === 'PAID' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}>
                    {selectedDelivery.delivery_type === 'PAID' ? '💰 PAID' : '🎁 FREE'}
                  </Badge>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge className={getStatusColor(selectedDelivery.delivery_status)}>{selectedDelivery.delivery_status}</Badge>
                </div>
                {selectedDelivery.delivery_type === 'PAID' && (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-sm text-muted-foreground">Revenue</span>
                    <span className="font-semibold text-green-600">{formatCurrency(selectedDelivery.delivery_revenue || 0)}</span>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-sm text-muted-foreground">Zone</span>
                  <span className="font-medium break-words">{selectedDelivery.zone_name ? `${selectedDelivery.zone_name} (${selectedDelivery.zone_code})` : 'N/A'}</span>
                </div>
                {selectedDelivery.delivery_address && (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-sm text-muted-foreground">Address</span>
                    <span className="font-medium break-words text-right">{selectedDelivery.delivery_address}</span>
                  </div>
                )}
              </div>

              {/* Schedule */}
              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg space-y-2 border border-blue-200 dark:border-blue-800">
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-sm text-muted-foreground">Scheduled Date</span>
                  <span className="font-medium break-words">
                    {selectedDelivery.scheduled_date
                      ? new Date(selectedDelivery.scheduled_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-sm text-muted-foreground">Time Slot</span>
                  <span className="font-medium break-words">{selectedDelivery.scheduled_time_slot || 'Not set'}</span>
                </div>
                {selectedDelivery.delivered_at && (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-sm text-muted-foreground">Delivered At</span>
                    <span className="font-medium text-green-600 break-words">
                      {new Date(selectedDelivery.delivered_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>

              {/* Driver / Person */}
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg space-y-2">
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-sm text-muted-foreground">Delivery Person</span>
                  <span className="font-medium break-words">{selectedDelivery.delivery_person_name || selectedDelivery.driver_name || 'Not assigned'}</span>
                </div>
                {(selectedDelivery.vehicle_info || selectedDelivery.vehicle_type) && (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-sm text-muted-foreground">Vehicle</span>
                    <span className="font-medium break-words">{selectedDelivery.vehicle_info || `${selectedDelivery.vehicle_type} - ${selectedDelivery.vehicle_number}`}</span>
                  </div>
                )}
                {selectedDelivery.delivery_notes && (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-sm text-muted-foreground">Notes</span>
                    <span className="text-sm text-right break-words">{selectedDelivery.delivery_notes}</span>
                  </div>
                )}
                {selectedDelivery.failed_reason && (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-sm text-muted-foreground">Failure Reason</span>
                    <span className="text-sm text-red-600 text-right break-words">{selectedDelivery.failed_reason}</span>
                  </div>
                )}
              </div>

              {/* Payment Info */}
              {selectedDelivery.delivery_type === 'PAID' && (
                <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg space-y-2 border border-green-200 dark:border-green-800">
                  <p className="text-sm font-semibold text-green-900 dark:text-green-100">💰 Payment Info</p>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-sm text-muted-foreground">Amount</span>
                    <span className="font-semibold">{formatCurrency(selectedDelivery.payment_amount || selectedDelivery.delivery_revenue || 0)}</span>
                  </div>
                  {selectedDelivery.payment_method && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="text-sm text-muted-foreground">Method</span>
                      <span className="font-medium break-words">{selectedDelivery.payment_method.replace('_', ' ')}</span>
                    </div>
                  )}
                  {selectedDelivery.payment_status && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge variant="outline">{selectedDelivery.payment_status}</Badge>
                    </div>
                  )}
                  {selectedDelivery.payment_notes && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="text-sm text-muted-foreground">Notes</span>
                      <span className="text-sm text-right break-words">{selectedDelivery.payment_notes}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedDelivery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigate('/orders', { state: { searchOrderNumber: selectedDelivery.order_number } });
                }}
                className="w-full sm:w-auto"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                View Order
              </Button>
            )}
            <Button onClick={() => setShowDetailDialog(false)} className="w-full sm:w-auto">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Record Delivery Payment</DialogTitle>
          </DialogHeader>
          
          {selectedDelivery && (
            <div className="space-y-4 pb-4">
              {/* Order Info */}
              <div className="bg-purple-50 dark:bg-purple-950 p-4 rounded-lg space-y-2 border border-purple-200 dark:border-purple-800">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Order:</span>
                  <span className="font-medium">{selectedDelivery.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Customer:</span>
                  <span className="font-medium">{selectedDelivery.customer_name}</span>
                </div>
                {selectedDelivery.zone_name && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Zone:</span>
                    <span className="font-medium">{selectedDelivery.zone_name}</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  💡 Enter the amount you agreed with the customer
                </div>
              </div>

              {/* Payment Amount */}
              <div className="space-y-2">
                <Label htmlFor="payment-amount">Delivery Payment Amount *</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min="0"
                  step="1000"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter agreed amount in UGX (e.g., 5000)"
                />
                <p className="text-xs text-muted-foreground">
                  💵 Enter the delivery charge you negotiated with the customer
                </p>
              </div>

              {/* Payment Method */}
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">💵 Cash</SelectItem>
                    <SelectItem value="MOBILE_MONEY">📱 Mobile Money (MTN/Airtel)</SelectItem>
                    <SelectItem value="CARD">💳 Card Payment</SelectItem>
                    <SelectItem value="BANK_TRANSFER">🏦 Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Payment Status */}
              <div className="space-y-2">
                <Label>Payment Status</Label>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAID">✅ Paid (Full amount received)</SelectItem>
                    <SelectItem value="PARTIAL">⚠️ Partial (Some amount received)</SelectItem>
                    <SelectItem value="PENDING">⏳ Pending (Not yet paid)</SelectItem>
                    <SelectItem value="REFUNDED">↩️ Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Payment Notes */}
              <div className="space-y-2">
                <Label htmlFor="payment-notes">Notes (Optional)</Label>
                <Textarea
                  id="payment-notes"
                  placeholder="e.g., Given discount, Received tip, Paid via MTN..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Summary */}
              {paymentAmount && parseFloat(paymentAmount) > 0 && (
                <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                    💰 Recording Delivery Payment
                  </p>
                  <div className="mt-2 space-y-1 text-green-800 dark:text-green-200">
                    <p className="text-base font-bold">Amount: {formatCurrency(parseFloat(paymentAmount))}</p>
                    <p className="text-sm">Method: {paymentMethod.replace('_', ' ')}</p>
                    <p className="text-sm">Status: {paymentStatus}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)} disabled={recordingPayment} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={recordingPayment || !paymentAmount || parseFloat(paymentAmount) < 0}
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {recordingPayment ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

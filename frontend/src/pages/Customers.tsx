import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import axios, { AxiosError } from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Search, Plus, Edit, Trash2, Eye, Phone, Mail, MapPin, 
  ChevronLeft, ChevronRight, Users, Building2, MessageSquare, ShoppingBag, ExternalLink, AlertTriangle, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { formatCustomerPhone } from "@/lib/phone";

/** Soft caps — keep optional fields free but bounded for storage/UI */
const CUSTOMER_LIMITS = {
  name: 255,
  location: 200,
  notes: 500,
} as const;

type PhoneHint =
  | { kind: 'idle' }
  | { kind: 'ok'; e164: string }
  | { kind: 'country'; message: string }
  | { kind: 'duplicate'; message: string };

interface Customer {
  id: number;
  customer_id: string;
  name: string;
  phone: string;
  email?: string;
  location?: string;
  notes?: string;
  sms_opt_in: boolean;
  customer_type: 'INDIVIDUAL' | 'BUSINESS';
  created_at: string;
  updated_at: string;
  total_orders?: number;
  total_spent?: string;
  last_order_date?: string;
}

interface CustomerOrder {
  id: number;
  order_number: string;
  created_at: string;
  pickup_date: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  payment_status: string;
  order_status: string;
  payment_method: string;
}

interface OrderItem {
  id: number;
  item_name?: string;
  service_name?: string;
  service_type: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export default function Customers() {
  const { token, canEditCustomers, canDeleteCustomers } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [filterSmsOptIn, setFilterSmsOptIn] = useState<string>("ALL");
  
  // Statistics state
  const [stats, setStats] = useState({
    total: 0,
    individuals: 0,
    businesses: 0,
    smsOptedIn: 0,
    smsOptedOut: 0,
  });
  
  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderHistoryPage, setOrderHistoryPage] = useState(1);
  const [totalOrderHistory, setTotalOrderHistory] = useState(0);
  const orderHistoryPageSize = 20;
  const [isOrderDetailsDialogOpen, setIsOrderDetailsDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    location: "",
    notes: "",
    sms_opt_in: true,
    customer_type: "INDIVIDUAL" as 'INDIVIDUAL' | 'BUSINESS',
  });
  const [phoneHint, setPhoneHint] = useState<PhoneHint>({ kind: 'idle' });
  const phoneCheckRef = useRef(0);

  // Handle search from navigation state
  useEffect(() => {
    if (location.state?.searchQuery) {
      setSearchQuery(location.state.searchQuery);
      // Clear the state after using it
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Handle customer ID from URL parameter (e.g., from Reports page)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const customerId = searchParams.get('id');
    
    if (customerId && token) {
      // Fetch the specific customer and open their details
      const fetchSpecificCustomer = async () => {
        try {
          const response = await axios.get(`${API_BASE_URL}/customers/${customerId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          
          const customer = response.data.customer;
          setSelectedCustomer(customer);
          
          // Set search query to customer's name to filter the list
          setSearchQuery(customer.name);
          
          // Open the view dialog to show customer details
          setIsViewDialogOpen(true);
          setCustomerOrders([]);
          setOrderHistoryPage(1);
          
          // Fetch customer's order history
          try {
            setLoadingOrders(true);
            const ordersResponse = await axios.get(`${API_BASE_URL}/orders`, {
              headers: { Authorization: `Bearer ${token}` },
              params: { 
                customer_id: parseInt(customerId), 
                page: 1,
                limit: 20
              }
            });
            
            const sortedOrders = (ordersResponse.data.orders || []).sort((a: CustomerOrder, b: CustomerOrder) => 
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            
            setCustomerOrders(sortedOrders);
            setTotalOrderHistory(ordersResponse.data.pagination?.total || 0);
          } catch (orderError) {
            console.error('Failed to fetch customer orders:', orderError);
          } finally {
            setLoadingOrders(false);
          }
          
          // Clean up URL parameter
          window.history.replaceState({}, document.title, '/customers');
          
          toast.success(`Viewing customer: ${customer.name}`);
        } catch (error) {
          console.error('Failed to fetch customer:', error);
          toast.error('Could not load customer details');
          // Clean up URL parameter even on error
          window.history.replaceState({}, document.title, '/customers');
        }
      };
      
      fetchSpecificCustomer();
    }
  }, [location.search, token]);

  // Live phone feedback: country code + duplicate owner
  useEffect(() => {
    if (!isAddDialogOpen && !isEditDialogOpen) {
      setPhoneHint({ kind: 'idle' });
      return;
    }

    const raw = formData.phone.trim();
    if (!raw) {
      setPhoneHint({ kind: 'idle' });
      return;
    }

    const formatted = formatCustomerPhone(raw);
    if (!formatted.ok) {
      setPhoneHint({ kind: 'country', message: formatted.message });
      return;
    }

    setPhoneHint({ kind: 'ok', e164: formatted.e164 });

    const checkId = ++phoneCheckRef.current;
    const timer = window.setTimeout(async () => {
      try {
        if (!token) return;
        const params: Record<string, string | number> = { phone: formatted.e164 };
        if (isEditDialogOpen && selectedCustomer?.id) {
          params.exclude_id = selectedCustomer.id;
        }
        const res = await axios.get(`${API_BASE_URL}/customers/check-duplicate`, {
          headers: { Authorization: `Bearer ${token}` },
          params,
        });
        if (checkId !== phoneCheckRef.current) return;
        if (res.data?.duplicates?.phone) {
          const owner = res.data.duplicates.phone;
          setPhoneHint({
            kind: 'duplicate',
            message:
              res.data.message ||
              `This number already belongs to "${owner.name}" (${owner.customer_id}). Use a different phone number.`,
          });
        } else {
          setPhoneHint({ kind: 'ok', e164: formatted.e164 });
        }
      } catch {
        // Keep format-ok hint if check fails
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    formData.phone,
    isAddDialogOpen,
    isEditDialogOpen,
    selectedCustomer?.id,
    token,
  ]);

  const fetchStats = useCallback(async () => {
    try {
      if (!token) return;
      const response = await axios.get(`${API_BASE_URL}/customers/stats/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(response.data);
    } catch (error) {
      console.error("Fetch stats error:", error);
      toast.error("Failed to load customer statistics");
    }
  }, [token]);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      
      if (!token) {
        return;
      }
      
      const params: Record<string, string | number | boolean> = {
        page: pagination.page,
        limit: pagination.limit,
      };
      
      if (searchQuery) params.search = searchQuery;
      if (filterType !== "ALL") params.customer_type = filterType;
      if (filterSmsOptIn !== "ALL") params.sms_opt_in = filterSmsOptIn === "true";
      
      const response = await axios.get(`${API_BASE_URL}/customers`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      
      setCustomers(response.data.customers);
      setPagination(response.data.pagination);
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      console.error("Fetch customers error:", error);
      
      if (axiosError.response?.status === 401) {
        toast.error("Session expired. Please log in again");
      } else {
        toast.error("Failed to load customers");
      }
    } finally {
      setLoading(false);
    }
  }, [token, pagination.page, pagination.limit, searchQuery, filterType, filterSmsOptIn]);

  useEffect(() => {
    fetchCustomers();
    fetchStats();
  }, [fetchCustomers, fetchStats]);

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchCustomers();
  };

  const handleAddCustomer = async () => {
    try {
      const token = localStorage.getItem("lush_token");
      
      if (!formData.name?.trim()) {
        toast.error("Customer name is required");
        return;
      }

      const phoneResult = formatCustomerPhone(formData.phone);
      if (!phoneResult.ok) {
        toast.error(phoneResult.message);
        setPhoneHint({ kind: 'country', message: phoneResult.message });
        return;
      }
      if (phoneHint.kind === 'duplicate') {
        toast.error(phoneHint.message);
        return;
      }
      
      await axios.post(
        `${API_BASE_URL}/customers`,
        { ...formData, name: formData.name.trim(), phone: phoneResult.e164 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success("Customer added successfully");
      setIsAddDialogOpen(false);
      resetForm();
      fetchCustomers();
      fetchStats(); // Refresh statistics
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string; message?: string; errors?: Array<{ msg: string; param: string }> }>;
      console.error("Add customer error:", error);
      
      // Show detailed validation errors if available
      if (axiosError.response?.data?.errors) {
        const validationErrors = axiosError.response.data.errors
          .map((err) => err.msg)
          .join(', ');
        toast.error(`Validation failed: ${validationErrors}`);
      } else {
        toast.error(
          axiosError.response?.data?.message ||
          axiosError.response?.data?.error ||
          "Failed to add customer"
        );
      }
    }
  };

  const handleEditCustomer = async () => {
    if (!selectedCustomer) return;
    if (!canEditCustomers) {
      toast.error("Only administrators can edit customer details");
      return;
    }
    
    try {
      const token = localStorage.getItem("lush_token");

      if (!formData.name?.trim()) {
        toast.error("Customer name is required");
        return;
      }

      const phoneResult = formatCustomerPhone(formData.phone);
      if (!phoneResult.ok) {
        toast.error(phoneResult.message);
        setPhoneHint({ kind: 'country', message: phoneResult.message });
        return;
      }
      if (phoneHint.kind === 'duplicate') {
        toast.error(phoneHint.message);
        return;
      }
      
      await axios.put(
        `${API_BASE_URL}/customers/${selectedCustomer.id}`,
        { ...formData, name: formData.name.trim(), phone: phoneResult.e164 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success("Customer updated successfully");
      setIsEditDialogOpen(false);
      resetForm();
      fetchCustomers();
      fetchStats(); // Refresh statistics
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string; message?: string; errors?: Array<{ msg: string }> }>;
      console.error("Update customer error:", error);
      if (axiosError.response?.data?.errors?.length) {
        toast.error(axiosError.response.data.errors.map((e) => e.msg).join(', '));
        return;
      }
      toast.error(
        axiosError.response?.data?.message ||
        axiosError.response?.data?.error ||
        "Failed to update customer"
      );
    }
  };

  const handleDeleteCustomer = async () => {
    if (!selectedCustomer) return;
    
    try {
      const token = localStorage.getItem("lush_token");
      
      await axios.delete(
        `${API_BASE_URL}/customers/${selectedCustomer.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success("Customer deleted successfully");
      setIsDeleteDialogOpen(false);
      setDeleteConfirmStep(1);
      setSelectedCustomer(null);
      fetchCustomers();
      fetchStats(); // Refresh statistics
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      console.error("Delete customer error:", error);
      toast.error(axiosError.response?.data?.error || "Failed to delete customer");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      location: "",
      notes: "",
      sms_opt_in: true,
      customer_type: "INDIVIDUAL",
    });
    setSelectedCustomer(null);
    setPhoneHint({ kind: 'idle' });
  };

  const openEditDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || "",
      location: customer.location || "",
      notes: customer.notes || "",
      sms_opt_in: customer.sms_opt_in,
      customer_type: customer.customer_type,
    });
    setIsEditDialogOpen(true);
  };

  const openViewDialog = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsViewDialogOpen(true);
    setCustomerOrders([]);
    setOrderHistoryPage(1);
    
    // Fetch customer's order history with pagination
    fetchCustomerOrders(customer.id, 1);
  };

  const fetchCustomerOrders = async (customerId: number, page: number) => {
    try {
      setLoadingOrders(true);
      const response = await axios.get(`${API_BASE_URL}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { 
          customer_id: customerId, 
          page: page,
          limit: orderHistoryPageSize
        }
      });
      
      // Sort orders by date - newest first (latest orders at top)
      const sortedOrders = (response.data.orders || []).sort((a: CustomerOrder, b: CustomerOrder) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      setCustomerOrders(sortedOrders);
      setTotalOrderHistory(response.data.total || sortedOrders.length);
    } catch (error) {
      console.error('Error fetching customer orders:', error);
      toast.error('Failed to load order history');
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleOrderHistoryPageChange = (newPage: number) => {
    if (selectedCustomer) {
      setOrderHistoryPage(newPage);
      fetchCustomerOrders(selectedCustomer.id, newPage);
    }
  };

  const viewOrderDetails = async (order: CustomerOrder) => {
    setSelectedOrder(order);
    setIsOrderDetailsDialogOpen(true);
    setOrderItems([]);
    
    try {
      setLoadingOrderDetails(true);
      const response = await axios.get(`${API_BASE_URL}/orders/${order.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setOrderItems(response.data.items || []);
    } catch (error) {
      console.error('Error fetching order details:', error);
      toast.error('Failed to load order details');
    } finally {
      setLoadingOrderDetails(false);
    }
  };

  const openDeleteDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDeleteDialogOpen(true);
  };

  return (
    <MainLayout title="Customers" subtitle="Manage your customer database">
      <div className="flex justify-end items-center mb-6">
        <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Customer
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Individual</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.individuals}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.total > 0 ? Math.round((stats.individuals / stats.total) * 100) : 0}% of customers
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Business</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.businesses}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.total > 0 ? Math.round((stats.businesses / stats.total) * 100) : 0}% of customers
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">WhatsApp/SMS Subscribers</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.smsOptedIn}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.total > 0 ? Math.round((stats.smsOptedIn / stats.total) * 100) : 0}% opted in for messages
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Customer List</CardTitle>
          <CardDescription>Manage your customer database</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, phone, email, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex gap-2 sm:gap-4">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Customer Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSmsOptIn} onValueChange={setFilterSmsOptIn}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Message Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Customers</SelectItem>
                  <SelectItem value="true">WhatsApp/SMS Enabled</SelectItem>
                  <SelectItem value="false">No Messages</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSearch} className="w-full sm:w-auto">Search</Button>
          </div>

          {/* Table */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Loading customers...
                    </TableCell>
                  </TableRow>
                ) : customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      No customers found
                    </TableCell>
                  </TableRow>
                ) : (
                  customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-mono text-sm">{customer.customer_id}</TableCell>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>{customer.phone}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer.email || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={customer.customer_type === 'BUSINESS' ? 'default' : 'secondary'}>
                          {customer.customer_type === 'BUSINESS' ? (
                            <><Building2 className="mr-1 h-3 w-3" />Business</>
                          ) : (
                            <><Users className="mr-1 h-3 w-3" />Individual</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {customer.sms_opt_in ? (
                          <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                            <MessageSquare className="mr-1 h-3 w-3" />Yes
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {customer.total_orders || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openViewDialog(customer)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canEditCustomers && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(customer)}
                                title="Edit customer (Admin only)"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                          )}
                          {canDeleteCustomers && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openDeleteDialog(customer)}
                                title="Delete customer (Admin only)"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-4 gap-3">
            <div className="text-sm text-muted-foreground">
              <span className="hidden sm:inline">Showing {customers.length > 0 ? ((pagination.page - 1) * pagination.limit) + 1 : 0} to{" "}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} customers</span>
              <span className="sm:hidden">{customers.length > 0 ? ((pagination.page - 1) * pagination.limit) + 1 : 0}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</span>
            </div>
            <div className="flex flex-wrap gap-1 sm:gap-2 items-center w-full sm:w-auto justify-center sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
                disabled={pagination.page === 1}
                className="hidden sm:inline-flex"
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
              >
                <ChevronLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              
              {/* Page Numbers */}
              <div className="flex gap-1">
                {/* Always show first page */}
                {pagination.page > 3 && (
                  <>
                    <Button
                      variant={pagination.page === 1 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
                      className="w-8 sm:w-10 px-0"
                    >
                      1
                    </Button>
                    {pagination.page > 4 && (
                      <span className="flex items-center px-1 sm:px-2">...</span>
                    )}
                  </>
                )}
                
                {/* Pages around current page */}
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter(pageNum => {
                    // Show pages within 2 of current page on desktop, 1 on mobile
                    return Math.abs(pageNum - pagination.page) <= 2;
                  })
                  .map(pageNum => (
                    <Button
                      key={pageNum}
                      variant={pagination.page === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPagination(prev => ({ ...prev, page: pageNum }))}
                      className="w-8 sm:w-10 px-0"
                    >
                      {pageNum}
                    </Button>
                  ))}
                
                {/* Always show last page */}
                {pagination.page < pagination.totalPages - 2 && (
                  <>
                    {pagination.page < pagination.totalPages - 3 && (
                      <span className="flex items-center px-1 sm:px-2">...</span>
                    )}
                    <Button
                      variant={pagination.page === pagination.totalPages ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPagination(prev => ({ ...prev, page: pagination.totalPages }))}
                      className="w-8 sm:w-10 px-0"
                    >
                      {pagination.totalPages}
                    </Button>
                  </>
                )}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={!pagination.hasMore}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4 sm:ml-1" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: pagination.totalPages }))}
                disabled={pagination.page === pagination.totalPages}
                className="hidden sm:inline-flex"
              >
                Last
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Customer Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Create a new customer record. Customer ID will be generated automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:gap-4 py-3 sm:py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value.slice(0, CUSTOMER_LIMITS.name) })}
                  placeholder="Enter customer name"
                  maxLength={CUSTOMER_LIMITS.name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+256700123456"
                />
                <p className="text-xs text-muted-foreground">
                  Include country code (e.g. +256…). Local 07… numbers are saved as +256…
                </p>
                {phoneHint.kind === 'country' && (
                  <Alert variant="destructive" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">{phoneHint.message}</AlertDescription>
                  </Alert>
                )}
                {phoneHint.kind === 'duplicate' && (
                  <Alert variant="destructive" className="py-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-sm">{phoneHint.message}</AlertDescription>
                  </Alert>
                )}
                {phoneHint.kind === 'ok' && (
                  <p className="text-xs text-green-600">Will save as {phoneHint.e164}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="customer@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value.slice(0, CUSTOMER_LIMITS.location) })}
                placeholder="Katete Zone A, Mbarara"
                maxLength={CUSTOMER_LIMITS.location}
              />
              <p className="text-xs text-muted-foreground text-right">
                {formData.location.length}/{CUSTOMER_LIMITS.location}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_type">Customer Type</Label>
              <Select
                value={formData.customer_type}
                onValueChange={(value: 'INDIVIDUAL' | 'BUSINESS') =>
                  setFormData({ ...formData, customer_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value.slice(0, CUSTOMER_LIMITS.notes) })}
                placeholder="Short notes about the customer (preferences, reminders…)"
                rows={2}
                maxLength={CUSTOMER_LIMITS.notes}
              />
              <p className="text-xs text-muted-foreground text-right">
                {formData.notes.length}/{CUSTOMER_LIMITS.notes}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sms_opt_in"
                checked={formData.sms_opt_in}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, sms_opt_in: checked as boolean })
                }
              />
              <Label htmlFor="sms_opt_in" className="text-sm font-normal cursor-pointer">
                Customer agrees to receive WhatsApp/SMS messages (offers, order updates, receipts)
              </Label>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setIsAddDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleAddCustomer}
              disabled={phoneHint.kind === 'country' || phoneHint.kind === 'duplicate'}
            >
              Add Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer information for {selectedCustomer?.customer_id}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:gap-4 py-3 sm:py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value.slice(0, CUSTOMER_LIMITS.name) })}
                  maxLength={CUSTOMER_LIMITS.name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone *</Label>
                <Input
                  id="edit-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+256700123456"
                />
                <p className="text-xs text-muted-foreground">
                  Include country code (e.g. +256…). Local 07… numbers are saved as +256…
                </p>
                {phoneHint.kind === 'country' && (
                  <Alert variant="destructive" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">{phoneHint.message}</AlertDescription>
                  </Alert>
                )}
                {phoneHint.kind === 'duplicate' && (
                  <Alert variant="destructive" className="py-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-sm">{phoneHint.message}</AlertDescription>
                  </Alert>
                )}
                {phoneHint.kind === 'ok' && (
                  <p className="text-xs text-green-600">Will save as {phoneHint.e164}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-location">Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="edit-location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value.slice(0, CUSTOMER_LIMITS.location) })}
                maxLength={CUSTOMER_LIMITS.location}
              />
              <p className="text-xs text-muted-foreground text-right">
                {formData.location.length}/{CUSTOMER_LIMITS.location}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-customer_type">Customer Type</Label>
              <Select
                value={formData.customer_type}
                onValueChange={(value: 'INDIVIDUAL' | 'BUSINESS') =>
                  setFormData({ ...formData, customer_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value.slice(0, CUSTOMER_LIMITS.notes) })}
                placeholder="Short notes about the customer (preferences, reminders…)"
                rows={2}
                maxLength={CUSTOMER_LIMITS.notes}
              />
              <p className="text-xs text-muted-foreground text-right">
                {formData.notes.length}/{CUSTOMER_LIMITS.notes}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-sms_opt_in"
                checked={formData.sms_opt_in}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, sms_opt_in: checked as boolean })
                }
              />
              <Label htmlFor="edit-sms_opt_in" className="text-sm font-normal cursor-pointer">
                Customer agrees to receive WhatsApp/SMS messages (offers, order updates, receipts)
              </Label>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setIsEditDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleEditCustomer}
              disabled={phoneHint.kind === 'country' || phoneHint.kind === 'duplicate'}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Customer Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
            <DialogDescription>
              View detailed information for {selectedCustomer?.customer_id}
            </DialogDescription>
          </DialogHeader>
          {selectedCustomer && (
            <div className="grid gap-4 py-4 min-w-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Customer ID</p>
                  <p className="font-mono font-medium">{selectedCustomer.customer_id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Customer Type</p>
                  <Badge variant={selectedCustomer.customer_type === 'BUSINESS' ? 'default' : 'secondary'}>
                    {selectedCustomer.customer_type}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{selectedCustomer.name}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone
                  </p>
                  <p className="font-medium">{selectedCustomer.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Email
                  </p>
                  <p className="font-medium">{selectedCustomer.email || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Location
                </p>
                <p className="font-medium">{selectedCustomer.location || "-"}</p>
              </div>
              {selectedCustomer.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="font-medium">{selectedCustomer.notes}</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">WhatsApp/SMS Messages</p>
                  <div className="font-medium">
                    {selectedCustomer.sms_opt_in ? (
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                        <MessageSquare className="mr-1 h-3 w-3" />Enabled
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700">Disabled</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Orders</p>
                  <p className="font-medium">{selectedCustomer.total_orders || 0}</p>
                </div>
              </div>
              {selectedCustomer.total_spent && (
                <div>
                  <p className="text-sm text-muted-foreground">Total Spent</p>
                  <p className="font-medium">{formatUGX(selectedCustomer.total_spent)}</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p>{new Date(selectedCustomer.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Updated</p>
                  <p>{new Date(selectedCustomer.updated_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Order History Section */}
              <div className="border-t pt-4 mt-4 min-w-0">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  Order History ({totalOrderHistory > 0 ? totalOrderHistory : customerOrders.length} total orders)
                </h3>
                {loadingOrders ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading orders...
                  </div>
                ) : customerOrders.length > 0 ? (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table className="min-w-[580px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Order #</TableHead>
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Date</TableHead>
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Total</TableHead>
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Balance</TableHead>
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Payment</TableHead>
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Status</TableHead>
                          <TableHead className="whitespace-nowrap px-2 sm:px-4">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerOrders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="font-mono text-xs font-medium px-2 sm:px-4 whitespace-nowrap">
                              {order.order_number}
                            </TableCell>
                            <TableCell className="text-xs px-2 sm:px-4 whitespace-nowrap">
                              {new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                            </TableCell>
                            <TableCell className="font-medium text-sm px-2 sm:px-4 whitespace-nowrap">
                              {formatUGX(order.total_amount)}
                            </TableCell>
                            <TableCell className={`px-2 sm:px-4 whitespace-nowrap ${order.balance > 0 ? 'text-red-600 font-medium text-sm' : 'text-muted-foreground text-sm'}`}>
                              {order.balance > 0 ? formatUGX(order.balance) : '-'}
                            </TableCell>
                            <TableCell className="px-2 sm:px-4">
                              <Badge className={
                                order.payment_status === 'PAID' 
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs' 
                                  : order.payment_status === 'PARTIAL'
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-xs'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs'
                              }>
                                {order.payment_status}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-2 sm:px-4">
                              <Badge variant={
                                order.order_status === 'DELIVERED' ? 'outline' : 
                                order.order_status === 'READY' ? 'outline' : 
                                order.order_status === 'PROCESSING' ? 'default' : 'secondary'
                              } className="text-xs">
                                {order.order_status}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-2 sm:px-4">
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => viewOrderDetails(order)}
                                  title="View order details"
                                  className="h-7 w-7 p-0"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setIsViewDialogOpen(false);
                                    navigate('/orders', { state: { searchOrderNumber: order.order_number } });
                                  }}
                                  title="Go to Orders page"
                                  className="h-7 w-7 p-0"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No orders found for this customer
                  </div>
                )}
                
                {/* Pagination for Order History */}
                {totalOrderHistory > orderHistoryPageSize && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-2 py-3 border-t mt-4 gap-2">
                    <div className="text-sm text-muted-foreground">
                      <span className="hidden sm:inline">Showing {Math.min((orderHistoryPage - 1) * orderHistoryPageSize + 1, totalOrderHistory)} to {Math.min(orderHistoryPage * orderHistoryPageSize, totalOrderHistory)} of {totalOrderHistory} orders</span>
                      <span className="sm:hidden">{Math.min((orderHistoryPage - 1) * orderHistoryPageSize + 1, totalOrderHistory)}-{Math.min(orderHistoryPage * orderHistoryPageSize, totalOrderHistory)} of {totalOrderHistory}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOrderHistoryPageChange(orderHistoryPage - 1)}
                        disabled={orderHistoryPage === 1 || loadingOrders}
                      >
                        <ChevronLeft className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Previous</span>
                      </Button>
                      <span className="text-sm font-medium whitespace-nowrap">
                        {orderHistoryPage}/{Math.ceil(totalOrderHistory / orderHistoryPageSize)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOrderHistoryPageChange(orderHistoryPage + 1)}
                        disabled={orderHistoryPage >= Math.ceil(totalOrderHistory / orderHistoryPageSize) || loadingOrders}
                      >
                        <span className="hidden sm:inline">Next</span>
                        <ChevronRight className="h-4 w-4 sm:ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedCustomer?.name}?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Deletion Rules:</strong>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>✅ Can delete: Customers with no orders OR all orders paid & delivered</li>
                  <li>❌ Cannot delete: Customers with unpaid, partial, or pending orders</li>
                  <li>🗑️ Warning: All customer's orders will also be permanently deleted</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDeleteDialogOpen(false); setSelectedCustomer(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteCustomer}>
              Delete Customer & Orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={isOrderDetailsDialogOpen} onOpenChange={setIsOrderDetailsDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Complete information for {selectedOrder?.order_number}
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-4 min-w-0">
              {/* Order Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Order Number</p>
                  <p className="font-mono font-semibold">{selectedOrder.order_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{new Date(selectedOrder.created_at).toLocaleString('en-GB')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Payment Status</p>
                  <Badge className={
                    selectedOrder.payment_status === 'PAID' 
                      ? 'bg-green-100 text-green-800' 
                      : selectedOrder.payment_status === 'PARTIAL'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }>
                    {selectedOrder.payment_status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Order Status</p>
                  <Badge variant="outline">{selectedOrder.order_status}</Badge>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="font-semibold mb-2">Order Items</h4>
                {loadingOrderDetails ? (
                  <div className="text-center py-4 text-muted-foreground">Loading items...</div>
                ) : orderItems.length > 0 ? (
                  <div className="overflow-x-auto">
                  <Table className="min-w-[450px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap px-2 sm:px-4">Item</TableHead>
                        <TableHead className="whitespace-nowrap px-2 sm:px-4">Service</TableHead>
                        <TableHead className="whitespace-nowrap text-right px-2 sm:px-4">Qty</TableHead>
                        <TableHead className="whitespace-nowrap text-right px-2 sm:px-4">Unit Price</TableHead>
                        <TableHead className="whitespace-nowrap text-right px-2 sm:px-4">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems.map((item: OrderItem, index: number) => (
                        <TableRow key={index}>
                          <TableCell className="px-2 sm:px-4 whitespace-nowrap">{item.item_name || item.service_name}</TableCell>
                          <TableCell className="px-2 sm:px-4">
                            <Badge variant="secondary" className="text-xs">{item.service_type}</Badge>
                          </TableCell>
                          <TableCell className="text-right px-2 sm:px-4">{item.quantity}</TableCell>
                          <TableCell className="text-right px-2 sm:px-4 whitespace-nowrap">{formatUGX(item.unit_price)}</TableCell>
                          <TableCell className="text-right px-2 sm:px-4 font-medium whitespace-nowrap">{formatUGX(item.total_price)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">No items found</div>
                )}
              </div>

              {/* Totals */}
              <div className="border-t pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Amount:</span>
                    <span className="font-semibold">{formatUGX(selectedOrder.total_amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount Paid:</span>
                    <span className="font-semibold text-green-600">{formatUGX(selectedOrder.amount_paid)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground font-medium">Balance Due:</span>
                    <span className={`font-bold ${selectedOrder.balance > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {formatUGX(selectedOrder.balance)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Payment Method:</span>
                    <span className="font-medium">{selectedOrder.payment_method?.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setIsOrderDetailsDialogOpen(false);
                navigate('/orders', { state: { searchOrderNumber: selectedOrder?.order_number } });
              }}
            >
              View in Orders Page
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => setIsOrderDetailsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

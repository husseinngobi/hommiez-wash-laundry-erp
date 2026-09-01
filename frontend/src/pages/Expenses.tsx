import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MainLayout } from '@/components/layout/MainLayout';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, DollarSign, Check, X, Eye, Calendar, Filter, Clock, Trash2, Loader2 } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface Expense {
  id: number;
  expense_date: string;
  category_name: string;
  category_color: string;
  description: string;
  amount: string;
  payment_method: string;
  receipt_number: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  recorded_by_name: string;
  approved_by_name: string;
  rejected_by_name?: string;
  rejection_reason?: string | null;
  created_at: string;
  branch_id?: number | null;
  branch_name?: string | null;
}

interface Category {
  id: number;
  name: string;
  description: string;
  color: string;
}

// Helpers for timezone-safe YYYY-MM and YYYY-MM-DD strings
const getLocalDateString = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatExpenseDate = (value?: string | null) => {
  if (!value) return '—';
  const dateOnly = String(value).match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  const parsed = dateOnly
    ? new Date(`${dateOnly}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString();
};

const getMonthBoundaries = (monthString: string) => {
  const [yearStr, monthStr] = monthString.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  
  const firstDay = `${yearStr}-${monthStr}-01`;
  const lastDayNum = new Date(year, month, 0).getDate();
  const lastDay = `${yearStr}-${monthStr}-${String(lastDayNum).padStart(2, '0')}`;
  
  return { firstDay, lastDay };
};

const Expenses = () => {
  const currentMonthStr = getLocalDateString().slice(0, 7);
  const initialBoundaries = getMonthBoundaries(currentMonthStr);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [pendingRejection, setPendingRejection] = useState<number | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [monthlyStats, setMonthlyStats] = useState({ total: 0, count: 0, pending: 0 });
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  const [filters, setFilters] = useState({
    from_date: initialBoundaries.firstDay,
    to_date: initialBoundaries.lastDay,
    category: '',
    status: '',
    search: '',
    branch_id: '',
  });

  const [actionLoading, setActionLoading] = useState<{
    id: number;
    action: 'APPROVED' | 'REJECTED' | 'DELETE';
  } | null>(null);

  const [formData, setFormData] = useState({
    expense_date: getLocalDateString(),
    category: '',
    description: '',
    amount: '',
    payment_method: 'CASH',
    receipt_number: '',
    branch_id: '',
  });

  const { token, user, isAdmin, isManager } = useAuth();
  const canChooseBranch = isAdmin || isManager;
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);

  const fetchExpenses = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, v]) => v !== '')
      );

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        ...activeFilters,
      });

      const response = await axios.get(`${API_BASE_URL}/expenses?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setExpenses(response.data.expenses || []);
      setTotalPages(response.data.pagination?.totalPages || 1);
    } catch (error: unknown) {
      console.error('Failed to fetch expenses:', error);
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        toast.error('Session expired. Please login again.');
        return;
      }
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [currentPage, filters, token]);

  const fetchCategories = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/expenses/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCategories(response.data || []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, [token]);

  const fetchMonthlyStats = useCallback(async () => {
    if (!token) return;
    try {
      const { firstDay, lastDay } = getMonthBoundaries(selectedMonth);

      const response = await axios.get(`${API_BASE_URL}/expenses`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          from_date: firstDay,
          to_date: lastDay,
          limit: 1000,
          ...(filters.branch_id ? { branch_id: filters.branch_id } : {}),
        },
      });

      const allExpenses: Expense[] = response.data.expenses || [];
      const approved = allExpenses.filter((e) => e.status === 'APPROVED');
      const pending = allExpenses.filter((e) => e.status === 'PENDING');

      setMonthlyStats({
        total: approved.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0),
        count: approved.length,
        pending: pending.length,
      });
    } catch (error) {
      console.error('Failed to fetch monthly stats:', error);
    }
  }, [selectedMonth, token, filters.branch_id]);

  useEffect(() => {
    if (!token) return;
    axios
      .get(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setBranches(res.data.branches || []))
      .catch(() => setBranches([]));
  }, [token]);

  useEffect(() => {
    fetchExpenses();
    fetchCategories();
    fetchMonthlyStats();
  }, [fetchExpenses, fetchCategories, fetchMonthlyStats]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      setSubmitting(true);
      await axios.post(`${API_BASE_URL}/expenses`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Expense recorded successfully');
      setShowAddDialog(false);
      setFormData({
        expense_date: getLocalDateString(),
        category: '',
        description: '',
        amount: '',
        payment_method: 'CASH',
        receipt_number: '',
        branch_id: user?.branch_id ? String(user.branch_id) : '',
      });
      fetchExpenses();
      fetchMonthlyStats();
    } catch (error: unknown) {
      console.error('Failed to record expense:', error);
      const errorMessage = axios.isAxiosError(error) 
        ? error.response?.data?.error 
        : undefined;
      toast.error(errorMessage || 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = (id: number, action?: 'APPROVED' | 'REJECTED' | 'DELETE') =>
    !!actionLoading && actionLoading.id === id && (!action || actionLoading.action === action);

  const canChangeStatus = (expense: Expense, nextStatus: 'APPROVED' | 'REJECTED') => {
    if (expense.status === nextStatus) return false;
    if (expense.status === 'PENDING') return isAdmin || isManager;
    return isAdmin;
  };

  const canChangeStatusFromList = (expense: Expense, nextStatus: 'APPROVED' | 'REJECTED') =>
    expense.status === 'PENDING' && canChangeStatus(expense, nextStatus);

  const requestReject = (id: number) => {
    if (actionLoading) return;
    setPendingRejection(id);
    setShowRejectDialog(true);
  };

  const handleApprove = async (id: number, status: 'APPROVED' | 'REJECTED') => {
    if (!token || actionLoading) return;
    try {
      setActionLoading({ id, action: status });
      await axios.patch(
        `${API_BASE_URL}/expenses/${id}/approve`,
        { approval_status: status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Expense ${status.toLowerCase()}`);
      setSelectedExpense((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
      fetchExpenses();
      fetchMonthlyStats();
    } catch (error: unknown) {
      console.error('Failed to approve expense:', error);
      const errorMessage = axios.isAxiosError(error) 
        ? error.response?.data?.error 
        : undefined;
      toast.error(errorMessage || 'Failed to approve expense');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (expense: Expense) => {
    if (!token || !isAdmin || actionLoading) return;
    const confirmed = window.confirm(
      `Permanently delete this ${expense.status.toLowerCase()} expense of ${formatUGX(expense.amount)}? This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      setActionLoading({ id: expense.id, action: 'DELETE' });
      await axios.delete(`${API_BASE_URL}/expenses/${expense.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Expense deleted');
      setShowDetailsDialog(false);
      setSelectedExpense(null);
      fetchExpenses();
      fetchMonthlyStats();
    } catch (error: unknown) {
      console.error('Failed to delete expense:', error);
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.error
        : undefined;
      toast.error(errorMessage || 'Failed to delete expense');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-green-500 hover:bg-green-600 text-white';
      case 'REJECTED': return 'bg-red-500 hover:bg-red-600 text-white';
      default: return 'bg-yellow-500 hover:bg-yellow-600 text-white';
    }
  };

  const formatPaymentMethod = (method: string) => {
    switch (method) {
      case 'CASH': return 'Cash';
      case 'MTN_MOBILE_MONEY': return 'MTN Mobile Money';
      case 'AIRTEL_MONEY': return 'Airtel Money';
      case 'MOBILE_MONEY': return 'Mobile Money';
      case 'BANK_TRANSFER': return 'Bank Transfer';
      case 'CENTENARY': return 'Centenary Bank';
      case 'CARD': return 'Card / Bancroft';
      default: return method?.replace(/_/g, ' ') || '-';
    }
  };

  return (
    <MainLayout title="Daily Expenses" subtitle="Record and track business expenses">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="flex-1 sm:flex-initial">
            <Label className="text-sm text-gray-600 dark:text-gray-400">Select Month</Label>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                const monthVal = e.target.value;
                if (!monthVal) return;
                setSelectedMonth(monthVal);
                const { firstDay, lastDay } = getMonthBoundaries(monthVal);
                setFilters((prev) => ({ ...prev, from_date: firstDay, to_date: lastDay }));
                setCurrentPage(1);
              }}
              className="w-full sm:w-48"
            />
          </div>
        </div>
        <Button
          onClick={() => {
            setFormData((prev) => ({
              ...prev,
              branch_id: user?.branch_id ? String(user.branch_id) : prev.branch_id,
            }));
            setShowAddDialog(true);
          }}
          className="gap-2 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Record Expense
        </Button>
      </div>

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-red-600">{formatUGX(monthlyStats.total)}</p>
                <p className="text-sm text-gray-500">{monthlyStats.count} approved expenses</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Pending Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="w-8 h-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-yellow-600">{monthlyStats.pending}</p>
                <p className="text-sm text-gray-500">awaiting admin review</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Selected Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Calendar className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">
                  {new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-sm text-gray-500">expense history</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <Label>From Date</Label>
              <Input
                type="date"
                value={filters.from_date}
                onChange={(e) => {
                  setFilters({ ...filters, from_date: e.target.value });
                  setCurrentPage(1);
                }}
              />
            </div>
            <div>
              <Label>To Date</Label>
              <Input
                type="date"
                value={filters.to_date}
                onChange={(e) => {
                  setFilters({ ...filters, to_date: e.target.value });
                  setCurrentPage(1);
                }}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={filters.category || 'all'}
                onValueChange={(val) => {
                  setFilters({ ...filters, category: val === 'all' ? '' : val });
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(val) => {
                  setFilters({ ...filters, status: val === 'all' ? '' : val });
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canChooseBranch && branches.length > 1 && (
              <div>
                <Label>Branch</Label>
                <Select
                  value={filters.branch_id || 'all'}
                  onValueChange={(val) => {
                    setFilters({ ...filters, branch_id: val === 'all' ? '' : val });
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Search</Label>
              <Input
                placeholder="Search..."
                value={filters.search}
                onChange={(e) => {
                  setFilters({ ...filters, search: e.target.value });
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Category</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Description</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">Amount</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Method</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Branch</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Recorded By</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Loading...
                    </td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No expenses found
                    </td>
                  </tr>
                ) : (
                  expenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className="border-b dark:border-gray-700 hover:bg-muted/60 dark:hover:bg-gray-700/50 transition-colors duration-150 cursor-pointer"
                      onClick={() => {
                        setSelectedExpense(expense);
                        setShowDetailsDialog(true);
                      }}
                    >
                      <td className="px-4 py-3 text-sm dark:text-gray-300">
                        {formatExpenseDate(expense.expense_date)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge style={{ backgroundColor: expense.category_color }} className="text-white">
                          {expense.category_name}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm max-w-xs dark:text-gray-300">
                        <p className="truncate">{expense.description}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-sm dark:text-gray-200">
                        {formatUGX(expense.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-muted-foreground">
                          {formatPaymentMethod(expense.payment_method)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={getStatusColor(expense.status)}>{expense.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm dark:text-gray-300">{expense.branch_name || '—'}</td>
                      <td className="px-4 py-3 text-sm dark:text-gray-300">{expense.recorded_by_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            title="View details"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedExpense(expense);
                              setShowDetailsDialog(true);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canChangeStatusFromList(expense, 'APPROVED') && (
                              <Button
                                size="sm"
                                className="bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
                                title="Approve"
                                disabled={!!actionLoading}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleApprove(expense.id, 'APPROVED');
                                }}
                              >
                                {isBusy(expense.id, 'APPROVED') ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}
                              </Button>
                          )}
                          {canChangeStatusFromList(expense, 'REJECTED') && (
                              <Button
                                size="sm"
                                className="bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
                                title="Reject"
                                disabled={!!actionLoading}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestReject(expense.id);
                                }}
                              >
                                {isBusy(expense.id, 'REJECTED') ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <X className="w-4 h-4" />
                                )}
                              </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 p-4 border-t dark:border-gray-700">
              <Button
                variant="outline"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              >
                Previous
              </Button>
              <span className="py-2 px-4 text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Expense Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Record New Expense</DialogTitle>
            <DialogDescription>Record a business expense for admin approval</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
              <div>
                <Label htmlFor="expense_date">Expense Date *</Label>
                <Input
                  id="expense_date"
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                  required
                />
              </div>
              {canChooseBranch && branches.length > 0 && (
                <div>
                  <Label>Branch *</Label>
                  <Select
                    value={formData.branch_id}
                    onValueChange={(val) => setFormData({ ...formData, branch_id: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData({ ...formData, category: val })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="amount">Amount (UGX) *</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="What was this expense for?"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="payment_method">Payment Method</Label>
                <Select
                  value={formData.payment_method}
                  onValueChange={(val) => setFormData({ ...formData, payment_method: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="MTN_MOBILE_MONEY">MTN Mobile Money</SelectItem>
                    <SelectItem value="AIRTEL_MONEY">Airtel Money</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="CENTENARY">Centenary Bank</SelectItem>
                    <SelectItem value="CARD">Card / Bancroft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="receipt_number">Receipt Number</Label>
                <Input
                  id="receipt_number"
                  placeholder="Optional"
                  value={formData.receipt_number}
                  onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddDialog(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {submitting ? 'Recording...' : 'Record Expense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Expense Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Expense Details</DialogTitle>
          </DialogHeader>
          {selectedExpense && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-600 dark:text-gray-400">Date</Label>
                  <p className="font-medium">
                    {formatExpenseDate(selectedExpense.expense_date)}
                  </p>
                </div>
                <div>
                  <Label className="text-gray-600 dark:text-gray-400">Category</Label>
                  <Badge
                    style={{ backgroundColor: selectedExpense.category_color }}
                    className="text-white mt-1 block w-fit"
                  >
                    {selectedExpense.category_name}
                  </Badge>
                </div>
                <div>
                  <Label className="text-gray-600 dark:text-gray-400">Amount</Label>
                  <p className="font-bold text-lg">{formatUGX(selectedExpense.amount)}</p>
                </div>
                <div>
                  <Label className="text-gray-600 dark:text-gray-400">Payment Method</Label>
                  <p className="font-medium">
                    {formatPaymentMethod(selectedExpense.payment_method)}
                  </p>
                </div>
                <div>
                  <Label className="text-gray-600 dark:text-gray-400">Receipt / Ref #</Label>
                  <p className="font-medium">{selectedExpense.receipt_number || '—'}</p>
                </div>
                <div>
                  <Label className="text-gray-600 dark:text-gray-400">Status</Label>
                  <Badge className={`${getStatusColor(selectedExpense.status)} mt-1 block w-fit`}>
                    {selectedExpense.status}
                  </Badge>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-gray-600 dark:text-gray-400">Description</Label>
                  <p className="mt-1 text-sm leading-relaxed bg-muted/50 rounded p-3 whitespace-pre-wrap dark:bg-gray-800">
                    {selectedExpense.description}
                  </p>
                </div>
                <div>
                  <Label className="text-gray-600 dark:text-gray-400">Recorded By</Label>
                  <p className="font-medium">{selectedExpense.recorded_by_name}</p>
                </div>
                <div>
                  <Label className="text-gray-600 dark:text-gray-400">Branch</Label>
                  <p className="font-medium">{selectedExpense.branch_name || '—'}</p>
                </div>
                {selectedExpense.status === 'APPROVED' && selectedExpense.approved_by_name && (
                  <div>
                    <Label className="text-gray-600 dark:text-gray-400">Approved By</Label>
                    <p className="font-medium">{selectedExpense.approved_by_name}</p>
                  </div>
                )}
                {selectedExpense.status === 'REJECTED' && selectedExpense.rejected_by_name && (
                  <div>
                    <Label className="text-gray-600 dark:text-gray-400">Rejected By</Label>
                    <p className="font-medium">{selectedExpense.rejected_by_name}</p>
                  </div>
                )}
                {selectedExpense.status === 'REJECTED' && selectedExpense.rejection_reason && (
                  <div className="sm:col-span-2">
                    <Label className="text-gray-600 dark:text-gray-400">Rejection Reason</Label>
                    <p className="mt-1 text-sm leading-relaxed bg-muted/50 rounded p-3 whitespace-pre-wrap dark:bg-gray-800">
                      {selectedExpense.rejection_reason}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {selectedExpense && canChangeStatus(selectedExpense, 'APPROVED') && (
                <Button
                  className="bg-green-500 hover:bg-green-600 text-white w-full sm:w-auto disabled:opacity-50"
                  disabled={!!actionLoading}
                  onClick={() => handleApprove(selectedExpense.id, 'APPROVED')}
                >
                  {isBusy(selectedExpense.id, 'APPROVED') ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  {selectedExpense.status === 'REJECTED' ? 'Approve instead' : 'Approve'}
                </Button>
              )}
              {selectedExpense && canChangeStatus(selectedExpense, 'REJECTED') && (
                <Button
                  className="bg-red-500 hover:bg-red-600 text-white w-full sm:w-auto disabled:opacity-50"
                  disabled={!!actionLoading}
                  onClick={() => requestReject(selectedExpense.id)}
                >
                  {isBusy(selectedExpense.id, 'REJECTED') ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <X className="w-4 h-4 mr-2" />
                  )}
                  {selectedExpense.status === 'APPROVED' ? 'Change to Rejected' : 'Reject'}
                </Button>
              )}
              {isAdmin && selectedExpense?.status === 'REJECTED' && (
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto disabled:opacity-50"
                  disabled={!!actionLoading}
                  onClick={() => handleDelete(selectedExpense)}
                >
                  {isBusy(selectedExpense.id, 'DELETE') ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Delete
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setShowDetailsDialog(false)}
              disabled={!!actionLoading}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showRejectDialog}
        onOpenChange={(open) => {
          setShowRejectDialog(open);
          if (!open) setPendingRejection(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject expense?</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this expense? The rejection will be recorded and the submitter will be notified.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)} disabled={!!actionLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!!actionLoading || pendingRejection === null}
              onClick={() => {
                if (pendingRejection === null) return;
                setShowRejectDialog(false);
                handleApprove(pendingRejection, 'REJECTED');
                setPendingRejection(null);
              }}
            >
              Reject expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Expenses;
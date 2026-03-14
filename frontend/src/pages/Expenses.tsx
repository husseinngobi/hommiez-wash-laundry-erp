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
import { Plus, DollarSign, Check, X, Eye, Calendar, Filter, Clock } from 'lucide-react';
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
  created_at: string;
}

interface Category {
  id: number;
  name: string;
  description: string;
  color: string;
}

const Expenses = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [monthlyStats, setMonthlyStats] = useState({ total: 0, count: 0, pending: 0 });
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM format
  
  // Set default filters to current month
  const today = new Date();
  const currentMonth = today.toISOString().slice(0, 7);
  const firstDay = `${currentMonth}-01`;
  const lastDay = `${currentMonth}-${new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()}`;
  
  const [filters, setFilters] = useState({
    from_date: firstDay,
    to_date: lastDay,
    category: '',
    status: '',
    search: '',
  });

  const [formData, setFormData] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    category: '',
    description: '',
    amount: '',
    payment_method: 'CASH',
    receipt_number: '',
  });

  const { token, isAdmin } = useAuth();

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      // Use token from AuthContext instead of localStorage directly
      if (!token) {
        throw new Error('No authentication token');
      }
      
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== '')),
      });

      const response = await axios.get(`${API_BASE_URL}/expenses?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setExpenses(response.data.expenses);
      setTotalPages(response.data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
      if (error && typeof error === 'object' && 'response' in error && 
          (error as { response?: { status?: number } }).response?.status === 401) {
        toast.error('Session expired. Please login again.');
        return;
      }
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [currentPage, filters, token]);

  const fetchCategories = useCallback(async () => {
    try {
      if (!token) return;
      const response = await axios.get(`${API_BASE_URL}/expenses/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, [token]);

  const fetchMonthlyStats = useCallback(async () => {
    try {
      if (!token) return;
      const [year, month] = selectedMonth.split('-');
      const from_date = `${year}-${month}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const to_date = `${year}-${month}-${lastDay}`;

      const response = await axios.get(`${API_BASE_URL}/expenses`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { from_date, to_date, limit: 1000 }, // Get all for the month
      });

      const allExpenses = response.data.expenses || [];
      const approved = allExpenses.filter((e: Expense) => e.status === 'APPROVED');
      const pending = allExpenses.filter((e: Expense) => e.status === 'PENDING');

      setMonthlyStats({
        total: approved.reduce((sum: number, e: Expense) => sum + parseFloat(e.amount), 0),
        count: approved.length,
        pending: pending.length,
      });
    } catch (error) {
      console.error('Failed to fetch monthly stats:', error);
    }
  }, [selectedMonth, token]);

  useEffect(() => {
    fetchExpenses();
    fetchCategories();
    fetchMonthlyStats();
  }, [fetchExpenses, fetchCategories, fetchMonthlyStats]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!token) return;
      await axios.post(`${API_BASE_URL}/expenses`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Expense recorded successfully');
      setShowAddDialog(false);
      setFormData({
        expense_date: new Date().toISOString().split('T')[0],
        category: '',
        description: '',
        amount: '',
        payment_method: 'CASH',
        receipt_number: '',
      });
      fetchExpenses();
    } catch (error) {
      console.error('Failed to record expense:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error 
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error 
        : undefined;
      toast.error(errorMessage || 'Failed to record expense');
    }
  };

  const handleApprove = async (id: number, status: 'APPROVED' | 'REJECTED') => {
    try {
      if (!token) return;
      await axios.patch(
        `${API_BASE_URL}/expenses/${id}/approve`,
        { approval_status: status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Expense ${status.toLowerCase()}`);
      fetchExpenses();
    } catch (error) {
      console.error('Failed to approve expense:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error 
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error 
        : undefined;
      toast.error(errorMessage || 'Failed to approve expense');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-500';
      case 'REJECTED':
        return 'bg-red-500';
      default:
        return 'bg-yellow-500';
    }
  };

  return (
    <MainLayout title="Daily Expenses" subtitle="Record and track business expenses">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="flex-1 sm:flex-initial">
            <Label className="text-sm text-gray-600">Select Month</Label>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                const [year, month] = e.target.value.split('-');
                const from = `${year}-${month}-01`;
                const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                const to = `${year}-${month}-${lastDay}`;
                setFilters({ ...filters, from_date: from, to_date: to });
                setCurrentPage(1);
              }}
              className="w-full sm:w-48"
            />
          </div>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          Record Expense
        </Button>
      </div>

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-red-600">
                  {formatUGX(monthlyStats.total)}
                </p>
                <p className="text-sm text-gray-500">{monthlyStats.count} approved expenses</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Pending Approval</CardTitle>
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
            <CardTitle className="text-sm font-medium text-gray-600">Selected Period</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Calendar className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">
                  {new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
                <p className="text-sm text-gray-500">expense history</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
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
                onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
              />
            </div>
            <div>
              <Label>To Date</Label>
              <Input
                type="date"
                value={filters.to_date}
                onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={filters.category || 'all'}
                onValueChange={(value) => setFilters({ ...filters, category: value === 'all' ? '' : value })}
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
                onValueChange={(value) => setFilters({ ...filters, status: value === 'all' ? '' : value })}
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
            <div>
              <Label>Search</Label>
              <Input
                placeholder="Search..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
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
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Recorded By</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Loading...
                    </td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No expenses found
                    </td>
                  </tr>
                ) : (
                  expenses.map((expense) => (
                    <tr key={expense.id} className="border-b dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150">
                      <td className="px-4 py-3 text-sm dark:text-gray-300">
                        {new Date(expense.expense_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge style={{ backgroundColor: expense.category_color }}>
                          {expense.category_name}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm max-w-xs truncate dark:text-gray-300">
                        {expense.description}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-sm dark:text-gray-200">
                        {formatUGX(expense.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={getStatusColor(expense.status)}>
                          {expense.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm dark:text-gray-300">{expense.recorded_by_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedExpense(expense);
                              setShowDetailsDialog(true);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {isAdmin && expense.status === 'PENDING' && (
                            <>
                              <Button
                                size="sm"
                                className="bg-green-500 hover:bg-green-600"
                                onClick={() => handleApprove(expense.id, 'APPROVED')}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                className="bg-red-500 hover:bg-red-600"
                                onClick={() => handleApprove(expense.id, 'REJECTED')}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </>
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
            <div className="flex justify-center gap-2 p-4 border-t">
              <Button
                variant="outline"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Previous
              </Button>
              <span className="py-2 px-4">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
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
            <DialogDescription>
              Record a business expense for admin approval
            </DialogDescription>
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
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
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
              <div className="md:col-span-2">
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
              <div>
                <Label htmlFor="payment_method">Payment Method</Label>
                <Select
                  value={formData.payment_method}
                  onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
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
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button type="submit" className="w-full sm:w-auto">Record Expense</Button>
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
                  <Label className="text-gray-600">Date</Label>
                  <p className="font-medium">
                    {new Date(selectedExpense.expense_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <Label className="text-gray-600">Category</Label>
                  <Badge style={{ backgroundColor: selectedExpense.category_color }}>
                    {selectedExpense.category_name}
                  </Badge>
                </div>
                <div>
                  <Label className="text-gray-600">Amount</Label>
                  <p className="font-bold text-lg">
                    {formatUGX(selectedExpense.amount)}
                  </p>
                </div>
                <div>
                  <Label className="text-gray-600">Payment Method</Label>
                  <p className="font-medium">{selectedExpense.payment_method}</p>
                </div>
                <div>
                  <Label className="text-gray-600">Receipt Number</Label>
                  <p className="font-medium">{selectedExpense.receipt_number || '-'}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-gray-600">Description</Label>
                  <p className="font-medium">{selectedExpense.description}</p>
                </div>
                <div>
                  <Label className="text-gray-600">Recorded By</Label>
                  <p className="font-medium">{selectedExpense.recorded_by_name}</p>
                </div>
                <div>
                  <Label className="text-gray-600">Status</Label>
                  <Badge className={getStatusColor(selectedExpense.status)}>
                    {selectedExpense.status}
                  </Badge>
                </div>
                {selectedExpense.approved_by_name && (
                  <div>
                    <Label className="text-gray-600">Approved By</Label>
                    <p className="font-medium">{selectedExpense.approved_by_name}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button onClick={() => setShowDetailsDialog(false)} className="w-full sm:w-auto">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Expenses;

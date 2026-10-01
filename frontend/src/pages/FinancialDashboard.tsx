import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  AlertCircle,
  Calendar,
  Download,
  Receipt,
  FileText,
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface DashboardData {
  summary: {
    total_revenue: string;
    total_expenses: string;
    total_salaries: string;
    net_profit: string;
    total_orders: number;
  };
  revenueBreakdown: Array<{
    payment_status: string;
    amount: string;
    count: string;
  }>;
  paymentMethodsBreakdown: Array<{
    method: string;
    transaction_count: number;
    total_amount: number;
  }>;
  topExpenses: Array<{
    category: string;
    color: string;
    amount: string;
    count: string;
  }>;
  dailyTrend: Array<{
    date: string;
    revenue: string;
    expenses: string;
    salaries: string;
    profit: string;
  }>;
  cashFlow: {
    cash_in: string;
    outstanding: string;
  };
  pendingExpenses: {
    count: string;
    amount: string;
  };
}

const FinancialDashboard = () => {
  const { token } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState(() => {
    return localStorage.getItem('financialDashboardPeriod') || 'all';
  });
  const [branchFilter, setBranchFilter] = useState('all');
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
  const [dateRange, setDateRange] = useState({
    from_date: '',
    to_date: '',
  });

  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // Save period to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('financialDashboardPeriod', period);
  }, [period]);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      if (!token) return;
      const response = await axios.get(
        `${API_BASE_URL}/financial/dashboard`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            period,
            ...(period === 'custom' && dateRange.from_date && dateRange.to_date
              ? dateRange
              : {}),
            ...(branchFilter !== 'all' ? { branch_id: branchFilter } : {}),
          },
        }
      );
      setDashboardData(response.data);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
      if (error && typeof error === 'object' && 'response' in error && 
          (error as { response?: { status?: number } }).response?.status === 401) {
        toast.error('Session expired. Please login again.');
        return;
      }
      const errorMessage = error && typeof error === 'object' && 'response' in error 
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error 
        : undefined;
      toast.error(errorMessage || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [period, dateRange, token, branchFilter]);

  useEffect(() => {
    if (period === 'custom' && (!dateRange.from_date || !dateRange.to_date)) return;
    fetchDashboard();
  }, [fetchDashboard, period, dateRange.from_date, dateRange.to_date]);

  useEffect(() => {
    if (!token) return;
    axios.get(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setBranches(res.data.branches || []))
      .catch(() => setBranches([]));
  }, [token]);

  // Format amount for PDF export
  const formatAmount = (amount: number) => {
    if (amount === undefined || amount === null || amount === 0) return 'UGX 0';
    const absAmount = Math.abs(amount);
    const formatted = `UGX ${absAmount.toLocaleString('en-UG')}`;
    return amount < 0 ? `(${formatted})` : formatted;
  };

  const handleExport = async () => {
    if (selectedReports.length === 0) {
      toast.error('Please select at least one section to export');
      return;
    }

    setExporting(true);
    try {
      if (!dashboardData) {
        toast.error('No data available to export');
        return;
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      let yPos = 20;

      // Add header
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Lush Laundry', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      doc.setFontSize(14);
      doc.text('Financial Dashboard', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const periodText = period === 'all' ? 'All Time' :
            period === 'today' ? 'Today' : 
                        period === 'week' ? 'This Week' : 
                        period === 'month' ? 'This Month' : 
                        `Year ${period}`;
      doc.text(`Period: ${periodText}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 6;

      doc.text(`Generated: ${new Date().toLocaleString('en-UG')}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      // Summary Section
      if (selectedReports.includes('summary')) {
        const totalRevenue = parseFloat(dashboardData.summary.total_revenue) || 0;
        const totalExpenses = parseFloat(dashboardData.summary.total_expenses) || 0;
        const netProfit = totalRevenue - totalExpenses;
        const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue * 100) : 0;

        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'FINANCIAL SUMMARY', colSpan: 2, styles: { fillColor: [37, 99, 235] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const } }]],
          body: [
            ['Total Revenue', formatAmount(totalRevenue)],
            ['Total Expenses', formatAmount(totalExpenses)],
            ['Net Profit', formatAmount(netProfit)],
            ['Profit Margin', `${profitMargin.toFixed(2)}%`],
          ],
          theme: 'grid',
          headStyles: { fillColor: [37, 99, 235] },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 'auto', halign: 'right' },
          },
        });
        yPos = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || yPos;
        yPos += 10;
      }

      // Revenue by Payment Status
      if (selectedReports.includes('revenue-breakdown') && dashboardData.revenueBreakdown) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        const revenueRows = dashboardData.revenueBreakdown.map((item: { payment_status: string; amount: string; count: string }) => [
          item.payment_status,
          formatAmount(parseFloat(item.amount) || 0),
          item.count.toString(),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'REVENUE BY PAYMENT STATUS', colSpan: 3, styles: { fillColor: [34, 197, 94] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const } }]],
          body: [
            [{ content: 'Status', styles: { fontStyle: 'bold' } }, { content: 'Amount', styles: { fontStyle: 'bold' } }, { content: 'Orders', styles: { fontStyle: 'bold' } }],
            ...revenueRows,
          ],
          theme: 'grid',
          headStyles: { fillColor: [34, 197, 94] },
        });
        yPos = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || yPos;
        yPos += 10;
      }

      // Top Expenses
      if (selectedReports.includes('expenses') && dashboardData.topExpenses) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        const expenseRows = dashboardData.topExpenses.map((item: { category: string; amount: string }) => [
          item.category,
          formatAmount(parseFloat(item.amount) || 0),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'TOP EXPENSE CATEGORIES', colSpan: 2, styles: { fillColor: [239, 68, 68] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const } }]],
          body: [
            [{ content: 'Category', styles: { fontStyle: 'bold' } }, { content: 'Amount', styles: { fontStyle: 'bold' } }],
            ...expenseRows,
          ],
          theme: 'grid',
          headStyles: { fillColor: [239, 68, 68] },
          columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 'auto', halign: 'right' },
          },
        });
        yPos = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || yPos;
        yPos += 10;
      }

      // Payment Methods
      if (selectedReports.includes('payment-methods') && dashboardData.paymentMethodsBreakdown) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        const paymentRows = dashboardData.paymentMethodsBreakdown.map((item: { method: string; total_amount: number; transaction_count: number }) => [
          item.method,
          formatAmount(item.total_amount || 0),
          item.transaction_count.toString(),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'REVENUE BY PAYMENT METHOD', colSpan: 3, styles: { fillColor: [168, 85, 247] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const } }]],
          body: [
            [{ content: 'Method', styles: { fontStyle: 'bold' } }, { content: 'Amount', styles: { fontStyle: 'bold' } }, { content: 'Transactions', styles: { fontStyle: 'bold' } }],
            ...paymentRows,
          ],
          theme: 'grid',
          headStyles: { fillColor: [168, 85, 247] },
        });
        yPos = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || yPos;
        yPos += 10;
      }

      // Daily Trend
      if (selectedReports.includes('daily-trend') && dashboardData.dailyTrend) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        const trendRows = dashboardData.dailyTrend.map((item: { date: string; revenue: string; expenses: string }) => [
          new Date(item.date).toLocaleDateString('en-UG'),
          formatAmount(parseFloat(item.revenue) || 0),
          formatAmount(parseFloat(item.expenses) || 0),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'DAILY TREND', colSpan: 3, styles: { fillColor: [249, 115, 22] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const } }]],
          body: [
            [{ content: 'Date', styles: { fontStyle: 'bold' } }, { content: 'Revenue', styles: { fontStyle: 'bold' } }, { content: 'Expenses', styles: { fontStyle: 'bold' } }],
            ...trendRows,
          ],
          theme: 'grid',
          headStyles: { fillColor: [249, 115, 22] },
        });
        yPos = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || yPos;
      }

      // Save PDF
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `lush-laundry-financial-${periodText.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.pdf`;
      doc.save(filename);

      toast.success('Financial report exported successfully');
      setShowExportDialog(false);
    } catch (error) {
      console.error('Export error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to export report: ${errorMessage}`);
    } finally {
      setExporting(false);
    }
  };

  // Extract data with fallbacks
  const summary = dashboardData?.summary || {
    total_revenue: '0',
    total_expenses: '0',
    total_salaries: '0',
    net_profit: '0',
    total_orders: 0,
  };
  const revenueBreakdown = dashboardData?.revenueBreakdown || [];
  const topExpenses = dashboardData?.topExpenses || [];
  const dailyTrend = dashboardData?.dailyTrend || [];
  const cashFlow = dashboardData?.cashFlow || { cash_in: '0', outstanding: '0' };
  const pendingExpenses = dashboardData?.pendingExpenses || { count: '0', amount: '0' };

  const profitMargin =
    parseFloat(summary.total_revenue) > 0
      ? ((parseFloat(summary.net_profit) / parseFloat(summary.total_revenue)) * 100).toFixed(1)
      : '0.0';

  const isProfitable = parseFloat(summary.net_profit) >= 0;

  // Prepare chart data
  const trendData = dailyTrend.map((day) => ({
    date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    revenue: parseFloat(day.revenue),
    expenses: parseFloat(day.expenses),
    profit: parseFloat(day.profit),
  }));

  const pieData = topExpenses.map((expense) => ({
    name: expense.category,
    value: parseFloat(expense.amount),
    color: expense.color,
  }));

  const COLORS = pieData.map((item) => item.color);

  return (
    <MainLayout
      title="Financial Dashboard"
      subtitle={
        branchFilter === 'all'
          ? 'Company-wide performance. Choose a branch to inspect one location; accounting still holds the full books.'
          : `Showing ${branches.find((b) => String(b.id) === branchFilter)?.name || 'selected branch'} — switch to All Branches for the company total.`
      }
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
              <SelectItem value="year">This Year (2026)</SelectItem>
              <SelectItem value="2027">Year 2027</SelectItem>
              <SelectItem value="2026">Year 2026</SelectItem>
              <SelectItem value="2025">Year 2025</SelectItem>
              <SelectItem value="2024">Year 2024</SelectItem>
              <SelectItem value="2023">Year 2023</SelectItem>
              <SelectItem value="2022">Year 2022</SelectItem>
              <SelectItem value="2021">Year 2021</SelectItem>
            </SelectContent>
          </Select>
          {period === 'custom' && (
            <>
              <div className="w-full sm:w-auto">
                <Label htmlFor="financial-from-date" className="sr-only">From date</Label>
                <Input
                  id="financial-from-date"
                  type="date"
                  value={dateRange.from_date}
                  onChange={(event) => setDateRange((current) => ({ ...current, from_date: event.target.value }))}
                  className="w-full"
                />
              </div>
              <div className="w-full sm:w-auto">
                <Label htmlFor="financial-to-date" className="sr-only">To date</Label>
                <Input
                  id="financial-to-date"
                  type="date"
                  value={dateRange.to_date}
                  onChange={(event) => setDateRange((current) => ({ ...current, to_date: event.target.value }))}
                  className="w-full"
                />
              </div>
            </>
          )}
          {branches.length > 1 && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches (company)</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setShowExportDialog(true)} variant="outline" className="gap-2 w-full sm:w-auto">
            <FileText className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Export Report</span>
            <span className="sm:hidden">Export</span>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-green-600 break-all">
              {loading ? '...' : formatUGX(summary.total_revenue)}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {loading ? '...' : `${summary.total_orders || 0} orders`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-orange-600 break-all">
              {loading ? '...' : formatUGX(summary.total_expenses)}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Operational costs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Salaries</CardTitle>
            <Receipt className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-purple-600 break-all">
              {loading ? '...' : formatUGX(summary.total_salaries)}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Payroll expenses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <TrendingUp
              className={`h-4 w-4 ${isProfitable ? 'text-blue-600' : 'text-red-600'}`}
            />
          </CardHeader>
          <CardContent>
            <div
              className={`text-xl sm:text-2xl font-bold break-all ${isProfitable ? 'text-blue-600' : 'text-red-600'}`}
            >
              {loading ? '...' : formatUGX(summary.net_profit)}
            </div>
            <Badge variant={isProfitable ? 'default' : 'destructive'} className="mt-1">
              {loading ? '...' : `${profitMargin}% margin`}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Expense Approvals</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-yellow-600">
              {loading ? '...' : pendingExpenses.count}
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {loading ? '...' : `${formatUGX(pendingExpenses.amount)} awaiting approval`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Cash Collected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-green-600 break-all">
              {loading ? '...' : formatUGX(cashFlow.cash_in)}
            </div>
            <p className="text-sm text-gray-600 mt-2">Payments received in selected period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Outstanding Receivables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-orange-600 break-all">
              {loading ? '...' : formatUGX(cashFlow.outstanding)}
            </div>
            <p className="text-sm text-gray-600 mt-2">Total unpaid balances (all orders)</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue by Payment Status</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : revenueBreakdown.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No revenue data for this period</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {revenueBreakdown.map((item) => {
                // Color coding: PAID=Green, PARTIAL=Blue, UNPAID=Red
                const colorConfig = item.payment_status === 'PAID'
                  ? { bg: 'bg-green-50 dark:bg-green-950', border: 'border-l-4 border-green-500', badge: 'bg-green-500 text-white' }
                  : item.payment_status === 'PARTIAL'
                  ? { bg: 'bg-blue-50 dark:bg-blue-950', border: 'border-l-4 border-blue-500', badge: 'bg-blue-500 text-white' }
                  : { bg: 'bg-red-50 dark:bg-red-950', border: 'border-l-4 border-red-500', badge: 'bg-red-500 text-white' };

                return (
                  <div
                    key={item.payment_status}
                    className={`p-4 rounded-lg ${colorConfig.bg} ${colorConfig.border}`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.payment_status}</p>
                      <Badge className={colorConfig.badge}>
                        {item.count} orders
                      </Badge>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold dark:text-white break-all">
                      {formatUGX(item.amount)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Methods Breakdown */}
      {dashboardData?.paymentMethodsBreakdown && dashboardData.paymentMethodsBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Payment Methods Breakdown
              {period === 'all' && ' (All Time)'}
              {period === 'today' && ' (Today)'}
              {period === 'week' && ' (This Week)'}
              {period === 'month' && ' (This Month)'}
              {period === 'year' && ' (This Year)'}
              {/^\d{4}$/.test(period) && ` (Year ${period})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {dashboardData.paymentMethodsBreakdown.map((method, idx) => {
                // Determine brand colors based on payment method
                let bgGradient = 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950';
                let textColor = 'text-blue-600 dark:text-blue-400';
                
                if (method.method.includes('MTN')) {
                  // MTN Mobile Money - YELLOW (MTN brand color)
                  bgGradient = 'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950 dark:to-amber-950';
                  textColor = 'text-yellow-600 dark:text-yellow-400';
                } else if (method.method.includes('Airtel')) {
                  // Airtel Money - RED (Airtel brand color)
                  bgGradient = 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950 dark:to-rose-950';
                  textColor = 'text-red-600 dark:text-red-400';
                } else if (method.method.includes('Cash')) {
                  // Cash - GREEN
                  bgGradient = 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950';
                  textColor = 'text-green-600 dark:text-green-400';
                } else if (method.method.includes('Bank')) {
                  // Bank Transfer - BLUE
                  bgGradient = 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950';
                  textColor = 'text-blue-600 dark:text-blue-400';
                }

                return (
                  <div
                    key={idx}
                    className={`p-4 border rounded-lg ${bgGradient}`}
                  >
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {method.method}
                    </p>
                    <p className={`text-xl sm:text-2xl font-bold break-all ${textColor}`}>
                      {formatUGX(method.total_amount)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {method.transaction_count} transaction{method.transaction_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Total Transactions:</strong>{' '}
                {dashboardData.paymentMethodsBreakdown.reduce((sum, m) => sum + m.transaction_count, 0)} |{' '}
                <strong>Total Amount:</strong>{' '}
                {formatUGX(dashboardData.paymentMethodsBreakdown.reduce((sum, m) => sum + m.total_amount, 0))}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle>
              Financial Trend
              {period === 'all' && ' (All Time)'}
              {period === 'today' && ' (Today)'}
              {period === 'week' && ' (7 Days)'}
              {period === 'month' && ' (This Month)'}
              {period === 'year' && ' (This Year)'}
              {/^\d{4}$/.test(period) && ` (${period})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center text-muted-foreground py-32">Loading chart...</div>
            ) : trendData.length === 0 ? (
              <div className="text-center text-muted-foreground py-32">No trend data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11 }}
                    angle={-35}
                    textAnchor="end"
                    height={50}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }}
                    width={60}
                    tickFormatter={(value) => {
                      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                      if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                      return value;
                    }}
                  />
                  <Tooltip formatter={(value: number) => formatUGX(value)} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    strokeWidth={2}
                    name="Revenue"
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    stroke="#ef4444"
                    strokeWidth={2}
                    name="Expenses"
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Profit"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top Expense Categories</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center text-muted-foreground py-32">Loading chart...</div>
            ) : pieData.length === 0 ? (
              <div className="text-center text-muted-foreground py-32">No expense data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    labelLine={false}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatUGX(value)}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={50}
                    iconType="circle"
                    wrapperStyle={{ fontSize: '12px', lineHeight: '18px' }}
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expense Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle>Expense Categories Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : topExpenses.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No expense data for this period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Category</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">Amount</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {topExpenses.map((expense) => {
                    const percentage =
                      parseFloat(summary.total_expenses) > 0
                        ? (
                            (parseFloat(expense.amount) / parseFloat(summary.total_expenses)) *
                            100
                          ).toFixed(1)
                        : '0.0';
                    return (
                      <tr key={expense.category} className="border-b dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150">
                        <td className="px-4 py-3">
                          <Badge style={{ backgroundColor: expense.color }}>
                            {expense.category}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold dark:text-gray-200">
                          {formatUGX(expense.amount)}
                        </td>
                        <td className="px-4 py-3 text-right dark:text-gray-300">{percentage}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Financial Dashboard</DialogTitle>
            <DialogDescription>
              Select the sections you want to include in the PDF export.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="summary"
                checked={selectedReports.includes('summary')}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedReports([...selectedReports, 'summary']);
                  } else {
                    setSelectedReports(selectedReports.filter((r) => r !== 'summary'));
                  }
                }}
              />
              <label htmlFor="summary" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Financial Summary
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="revenue-breakdown"
                checked={selectedReports.includes('revenue-breakdown')}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedReports([...selectedReports, 'revenue-breakdown']);
                  } else {
                    setSelectedReports(selectedReports.filter((r) => r !== 'revenue-breakdown'));
                  }
                }}
              />
              <label htmlFor="revenue-breakdown" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Revenue by Payment Status
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="expenses"
                checked={selectedReports.includes('expenses')}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedReports([...selectedReports, 'expenses']);
                  } else {
                    setSelectedReports(selectedReports.filter((r) => r !== 'expenses'));
                  }
                }}
              />
              <label htmlFor="expenses" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Top Expense Categories
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="payment-methods"
                checked={selectedReports.includes('payment-methods')}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedReports([...selectedReports, 'payment-methods']);
                  } else {
                    setSelectedReports(selectedReports.filter((r) => r !== 'payment-methods'));
                  }
                }}
              />
              <label htmlFor="payment-methods" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Revenue by Payment Method
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="daily-trend"
                checked={selectedReports.includes('daily-trend')}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedReports([...selectedReports, 'daily-trend']);
                  } else {
                    setSelectedReports(selectedReports.filter((r) => r !== 'daily-trend'));
                  }
                }}
              />
              <label htmlFor="daily-trend" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Daily Trend (Revenue vs Expenses)
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedReports(['summary', 'revenue-breakdown', 'expenses', 'payment-methods', 'daily-trend'])}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedReports([])}
              >
                Clear All
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              {selectedReports.length === 0
                ? 'No sections selected'
                : `${selectedReports.length} section${selectedReports.length !== 1 ? 's' : ''} selected`}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={exporting || selectedReports.length === 0}>
              {exporting ? 'Exporting...' : `Export (${selectedReports.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default FinancialDashboard;

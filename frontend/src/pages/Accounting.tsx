import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';
import { 
  FileText, 
  TrendingUp, 
  DollarSign, 
  Scale, 
  Download,
  Calendar,
  PieChart,
  BarChart3,
  Users
} from 'lucide-react';
import { formatUGX } from '@/lib/currency';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Extend jsPDF type for lastAutoTable
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable?: {
      finalY: number;
    };
  }
}

// TypeScript Interfaces
interface RevenueCategory {
  category: string;
  revenue: number;
  order_count: number;
}

interface ExpenseCategory {
  category: string;
  amount: number;
  count: number;
}

interface IncomeStatement {
  period: string;
  revenue: {
    total: number;
    net_revenue?: number;
    gross_payments?: number;
    refunds?: number;
    order_count: number;
    by_category: RevenueCategory[];
  };
  vat_summary?: {
    orders_with_vat: number;
    total_vat_collected: number;
    revenue_inc_vat: number;
    revenue_exc_vat: number;
  };
  cost_of_goods_sold: number;
  gross_profit: number;
  operating_expenses: {
    total: number;
    by_category: ExpenseCategory[];
  };
  salaries: {
    total: number;
    payment_count: number;
  };
  net_profit: number;
  profit_margin: number;
}

interface BalanceSheet {
  as_of_date: string;
  assets: {
    current_assets: {
      cash: number;
      accounts_receivable: number;
      inventory: number;
      total: number;
    };
    total_assets: number;
  };
  liabilities: {
    current_liabilities: {
      accounts_payable: number;
      accrued_salaries: number;
    };
    total_liabilities: number;
  };
  equity: {
    retained_earnings: number;
    total_equity: number;
  };
  is_balanced: boolean;
  balance_check: {
    balanced: boolean;
    difference?: number;
  };
}

interface CashFlow {
  period: string;
  operating_activities: {
    cash_from_customers: number;
    cash_paid_for_expenses: number;
    cash_paid_for_salaries: number;
    net_cash_from_operations: number;
  };
  investing_activities: {
    inventory_purchases: number;
    net_cash_from_investing: number;
  };
  net_increase_in_cash: number;
  cash_at_end: number;
}

interface TrialBalanceAccount {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
}

interface TrialBalance {
  as_of_date: string;
  accounts: TrialBalanceAccount[];
  totals: {
    total_debits: number;
    total_credits: number;
    is_balanced: boolean;
    balanced: boolean;
    difference?: number;
  };
}

export default function Accounting() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('income-statement');
  const [period, setPeriod] = useState('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [branchFilter, setBranchFilter] = useState('all');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
  const [branchSummary, setBranchSummary] = useState<{
    overall: { revenue: number; expenses: number; net_profit: number; order_count: number };
    branches: Array<{
      branch_id: number;
      branch_name: string;
      revenue: number;
      expenses: number;
      net_profit: number;
      order_count: number;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  
  const [incomeStatement, setIncomeStatement] = useState<IncomeStatement | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);

  const getAccountingPeriodParams = () => {
    const parts = period === 'custom' && customFromDate && customToDate
      ? [`period=custom`, `from_date=${customFromDate}`, `to_date=${customToDate}`]
      : period === 'year'
      ? [`period=${period}`, `year=${selectedYear}`]
      : [`period=${period}`];
    if (branchFilter !== 'all') {
      parts.push(`branch_id=${branchFilter}`);
    }
    return parts.join('&');
  };

  const getAsOfDate = () => {
    if (period === 'year') {
      return `${selectedYear}-12-31`;
    }

    return new Date().toISOString().split('T')[0];
  };

  useEffect(() => {
    if (!token) return;
    axios.get(`${API_BASE_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setBranches(res.data.branches || []))
      .catch(() => setBranches([]));
  }, [token]);

  useEffect(() => {
    if (period === 'custom' && (!customFromDate || !customToDate)) return;
    if (activeTab === 'income-statement') {
      fetchIncomeStatement();
    } else if (activeTab === 'balance-sheet') {
      fetchBalanceSheet();
    } else if (activeTab === 'cash-flow') {
      fetchCashFlow();
    } else if (activeTab === 'trial-balance') {
      fetchTrialBalance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, period, selectedYear, customFromDate, customToDate, token, branchFilter]);

  const fetchIncomeStatement = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_BASE_URL}/accounting/income-statement?${getAccountingPeriodParams()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIncomeStatement(response.data);
      if (branchFilter === 'all') {
        try {
          const summary = await axios.get(
            `${API_BASE_URL}/accounting/branch-summary?${getAccountingPeriodParams()}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setBranchSummary(summary.data);
        } catch {
          setBranchSummary(null);
        }
      } else {
        setBranchSummary(null);
      }
    } catch (error) {
      const errorResponse = error && typeof error === 'object' && 'response' in error ? (error as {response?: {data?: {error?: string}}}).response : null;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Income statement error:', errorResponse?.data || errorMessage);
      toast.error(errorResponse?.data?.error || 'Failed to load income statement');
    } finally {
      setLoading(false);
    }
  };

  const fetchBalanceSheet = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_BASE_URL}/accounting/balance-sheet`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBalanceSheet(response.data);
    } catch (error) {
      const errorResponse = error && typeof error === 'object' && 'response' in error ? (error as {response?: {data?: {error?: string}}}).response : null;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Balance sheet error:', errorResponse?.data || errorMessage);
      toast.error(errorResponse?.data?.error || 'Failed to load balance sheet');
    } finally {
      setLoading(false);
    }
  };

  const fetchCashFlow = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_BASE_URL}/accounting/cash-flow?${getAccountingPeriodParams()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCashFlow(response.data);
    } catch (error) {
      const errorResponse = error && typeof error === 'object' && 'response' in error ? (error as {response?: {data?: {error?: string}}}).response : null;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Cash flow statement error:', errorResponse?.data || errorMessage);
      toast.error(errorResponse?.data?.error || 'Failed to load cash flow statement');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrialBalance = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_BASE_URL}/accounting/trial-balance?as_of_date=${getAsOfDate()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTrialBalance(response.data);
    } catch (error) {
      toast.error('Failed to load trial balance');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (selectedReports.length === 0) {
      toast.error('Please select at least one report to export');
      return;
    }

    try {
      setExporting(true);
      
      // Fetch any missing report data before export
      let incomeData = incomeStatement;
      let balanceData = balanceSheet;
      let cashFlowData = cashFlow;
      let trialBalanceData = trialBalance;
      
      const fetchPromises = [];
      
      if (selectedReports.includes('income-statement') && !incomeData) {
        fetchPromises.push(
          axios.get(`${API_BASE_URL}/accounting/income-statement?${getAccountingPeriodParams()}`, {
            headers: { Authorization: `Bearer ${token}` }
          }).then(res => {
            incomeData = res.data;
            setIncomeStatement(res.data);
          })
        );
      }
      
      if (selectedReports.includes('balance-sheet') && !balanceData) {
        fetchPromises.push(
          axios.get(`${API_BASE_URL}/accounting/balance-sheet`, {
            headers: { Authorization: `Bearer ${token}` }
          }).then(res => {
            balanceData = res.data;
            setBalanceSheet(res.data);
          })
        );
      }
      
      if (selectedReports.includes('cash-flow') && !cashFlowData) {
        fetchPromises.push(
          axios.get(`${API_BASE_URL}/accounting/cash-flow?${getAccountingPeriodParams()}`, {
            headers: { Authorization: `Bearer ${token}` }
          }).then(res => {
            cashFlowData = res.data;
            setCashFlow(res.data);
          })
        );
      }
      
      if (selectedReports.includes('trial-balance') && !trialBalanceData) {
        fetchPromises.push(
          axios.get(`${API_BASE_URL}/accounting/trial-balance?as_of_date=${getAsOfDate()}`, {
            headers: { Authorization: `Bearer ${token}` }
          }).then(res => {
            trialBalanceData = res.data;
            setTrialBalance(res.data);
          })
        );
      }
      
      // Wait for all data to load
      if (fetchPromises.length > 0) {
        toast.info('Loading report data...');
        await Promise.all(fetchPromises);
      }
      
      // Now check if we have all the data
      const missingData = [];
      if (selectedReports.includes('income-statement') && !incomeData) {
        missingData.push('Income Statement');
      }
      if (selectedReports.includes('balance-sheet') && !balanceData) {
        missingData.push('Balance Sheet');
      }
      if (selectedReports.includes('cash-flow') && !cashFlowData) {
        missingData.push('Cash Flow');
      }
      if (selectedReports.includes('trial-balance') && !trialBalanceData) {
        missingData.push('Trial Balance');
      }

      if (missingData.length > 0) {
        toast.error(`Failed to load: ${missingData.join(', ')}`);
        return;
      }
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPos = 20;

      // Helper function to add page header
      const addPageHeader = (isFirstPage: boolean = false) => {
        if (!isFirstPage) {
          doc.addPage();
          yPos = 20;
        }
        // Company name
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Lush Laundry', pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Financial Reports', pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 6;
        const periodText = period === 'all' ? 'All Time' : period === 'today' ? 'Today' : 
                          period === 'week' ? 'This Week' : period === 'month' ? 'This Month' : 'This Year';
        doc.text(`Period: ${periodText} (${selectedYear})`, pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 5;
        doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, pageWidth / 2, yPos, { align: 'center' });
        
        yPos += 10;
      };

      // Helper function for accounting amounts (handles negative numbers and null values)
      const formatAmount = (amount: number) => {
        if (amount === undefined || amount === null || amount === 0) return 'UGX 0';
        const absAmount = Math.abs(amount);
        const formatted = `UGX ${absAmount.toLocaleString('en-UG')}`;
        return amount < 0 ? `(${formatted})` : formatted;
      };

      addPageHeader(true);

      // Income Statement
      if (selectedReports.includes('income-statement') && incomeData) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235); // Blue
        doc.text('Income Statement', 14, yPos);
        yPos += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);

        // Get expense categories
        const expensesByCategory = incomeData.operating_expenses.by_category.reduce((acc, exp) => {
          acc[exp.category] = exp.amount;
          return acc;
        }, {} as Record<string, number>);

        const profitMargin = typeof incomeData.profit_margin === 'number' 
          ? incomeData.profit_margin 
          : parseFloat(String(incomeData.profit_margin)) || 0;

        const incomeDataRows = [
          [{ content: 'REVENUE', colSpan: 2, styles: { fillColor: [37, 99, 235] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['Total Revenue', formatAmount(incomeData.revenue.total ?? incomeData.revenue.net_revenue ?? 0)],
          ['Order Count', incomeData.revenue.order_count.toString()],
          [{ content: 'COST OF GOODS SOLD', colSpan: 2, styles: { fillColor: [239, 68, 68] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['Total COGS', formatAmount(incomeData.cost_of_goods_sold || 0)],
          [{ content: 'GROSS PROFIT', colSpan: 2, styles: { fillColor: [34, 197, 94] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['', formatAmount(incomeData.gross_profit || 0)],
          [{ content: 'OPERATING EXPENSES', colSpan: 2, styles: { fillColor: [249, 115, 22] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['Salaries & Wages', formatAmount(incomeData.salaries.total || 0)],
          ['Utilities', formatAmount(expensesByCategory['Utilities'] || 0)],
          ['Marketing', formatAmount(expensesByCategory['Marketing'] || 0)],
          ['Other Expenses', formatAmount(incomeData.operating_expenses.total - (incomeData.salaries.total || 0) || 0)],
          ['Total Operating Expenses', formatAmount(incomeData.operating_expenses.total + incomeData.salaries.total || 0)],
          [{ content: 'NET PROFIT', colSpan: 2, styles: { fillColor: [168, 85, 247] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['', formatAmount(incomeData.net_profit || 0)],
          ['Profit Margin', `${profitMargin.toFixed(2)}%`],
        ];

        autoTable(doc, {
          startY: yPos,
          head: [],
          body: incomeDataRows,
          theme: 'grid',
          styles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 120 },
            1: { cellWidth: 60, halign: 'right', fontStyle: 'bold' }
          }
        });

        yPos = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 15 : yPos;
        if (yPos > pageHeight - 30) addPageHeader();
      }

      // Balance Sheet
      if (selectedReports.includes('balance-sheet') && balanceData) {
        if (selectedReports.includes('income-statement')) addPageHeader();
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(34, 197, 94); // Green
        doc.text('Balance Sheet', 14, yPos);
        yPos += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);

        const balanceSheetRows = [
          [{ content: 'ASSETS', colSpan: 2, styles: { fillColor: [37, 99, 235] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['Cash & Bank', formatAmount(balanceData.assets.current_assets.cash || 0)],
          ['Accounts Receivable', formatAmount(balanceData.assets.current_assets.accounts_receivable || 0)],
          ['Inventory', formatAmount(balanceData.assets.current_assets.inventory || 0)],
          ['Total Current Assets', formatAmount(balanceData.assets.current_assets.total || 0)],
          [{ content: 'TOTAL ASSETS', colSpan: 2, styles: { fillColor: [37, 99, 235] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['', formatAmount(balanceData.assets.total_assets || 0)],
          [{ content: 'LIABILITIES', colSpan: 2, styles: { fillColor: [239, 68, 68] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['Accounts Payable', formatAmount(balanceData.liabilities.current_liabilities.accounts_payable || 0)],
          ['Accrued Salaries', formatAmount(balanceData.liabilities.current_liabilities.accrued_salaries || 0)],
          [{ content: 'TOTAL LIABILITIES', colSpan: 2, styles: { fillColor: [239, 68, 68] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['', formatAmount(balanceData.liabilities.total_liabilities || 0)],
          [{ content: 'EQUITY', colSpan: 2, styles: { fillColor: [34, 197, 94] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['Retained Earnings', formatAmount(balanceData.equity.retained_earnings || 0)],
          [{ content: 'TOTAL EQUITY', colSpan: 2, styles: { fillColor: [34, 197, 94] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['', formatAmount(balanceData.equity.total_equity || 0)],
          [{ content: balanceData.is_balanced ? 'BALANCED' : 'UNBALANCED', colSpan: 2, styles: { fillColor: (balanceData.is_balanced ? [34, 197, 94] : [239, 68, 68]) as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
        ];

        autoTable(doc, {
          startY: yPos,
          head: [],
          body: balanceSheetRows,
          theme: 'grid',
          styles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 120 },
            1: { cellWidth: 60, halign: 'right', fontStyle: 'bold' }
          }
        });

        yPos = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 15 : yPos;
      }

      // Cash Flow Statement
      if (selectedReports.includes('cash-flow') && cashFlowData) {
        addPageHeader();
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(249, 115, 22); // Orange
        doc.text('Cash Flow Statement', 14, yPos);
        yPos += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);

        const cashFlowRows = [
          [{ content: 'OPERATING ACTIVITIES', colSpan: 2, styles: { fillColor: [249, 115, 22] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['Cash from Customers', formatAmount(cashFlowData.operating_activities.cash_from_customers || 0)],
          ['Cash Paid for Expenses', formatAmount(cashFlowData.operating_activities.cash_paid_for_expenses || 0)],
          ['Cash Paid for Salaries', formatAmount(cashFlowData.operating_activities.cash_paid_for_salaries || 0)],
          ['Net Operating Cash Flow', formatAmount(cashFlowData.operating_activities.net_cash_from_operations || 0)],
          [{ content: 'INVESTING ACTIVITIES', colSpan: 2, styles: { fillColor: [168, 85, 247] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['Inventory Purchases', formatAmount(cashFlowData.investing_activities.inventory_purchases || 0)],
          ['Net Investing Cash Flow', formatAmount(cashFlowData.investing_activities.net_cash_from_investing || 0)],
          [{ content: 'NET INCREASE IN CASH', colSpan: 2, styles: { fillColor: [34, 197, 94] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['', formatAmount(cashFlowData.net_increase_in_cash || 0)],
          [{ content: 'CASH AT END OF PERIOD', colSpan: 2, styles: { fillColor: [37, 99, 235] as [number, number, number], textColor: 255, fontStyle: 'bold' as const } }],
          ['', formatAmount(cashFlowData.cash_at_end || 0)],
        ];

        autoTable(doc, {
          startY: yPos,
          head: [],
          body: cashFlowRows,
          theme: 'grid',
          styles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 120 },
            1: { cellWidth: 60, halign: 'right', fontStyle: 'bold' }
          }
        });

        yPos = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 15 : yPos;
      }

      // Trial Balance
      if (selectedReports.includes('trial-balance') && trialBalanceData) {
        addPageHeader();
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(168, 85, 247); // Purple
        doc.text('Trial Balance', 14, yPos);
        yPos += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);

        const trialBalanceRows = trialBalanceData.accounts?.map((acc: TrialBalanceAccount) => [
          acc.account_name,
          formatAmount(acc.debit || 0),
          formatAmount(acc.credit || 0)
        ]) || [];

        autoTable(doc, {
          startY: yPos,
          head: [['Account Name', 'Debit', 'Credit']],
          body: [
            ...trialBalanceRows,
            [{ content: 'TOTALS', styles: { fontStyle: 'bold', fillColor: [168, 85, 247], textColor: 255 } },
             { content: formatAmount(trialBalanceData.totals?.total_debits || 0), styles: { fontStyle: 'bold', fillColor: [168, 85, 247], textColor: 255 } },
             { content: formatAmount(trialBalanceData.totals?.total_credits || 0), styles: { fontStyle: 'bold', fillColor: [168, 85, 247], textColor: 255 } }]
          ],
          theme: 'grid',
          styles: { fontSize: 9 },
          headStyles: { fillColor: [168, 85, 247] },
          columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 40, halign: 'right' },
            2: { cellWidth: 40, halign: 'right' }
          }
        });
      }

      // Save PDF
      const periodText = period === 'all' ? 'all-time' : period;
      doc.save(`lush-laundry-accounting-${periodText}-${selectedYear}-${Date.now()}.pdf`);

      toast.success(`Exported ${selectedReports.length} report(s) as PDF successfully`);
      setShowExportDialog(false);
      setSelectedReports([]);
    } catch (error) {
      console.error('Export error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to export reports: ${errorMessage}`);
      // Log which reports were being exported for debugging
      console.error('Selected reports:', selectedReports);
      console.error('Cash Flow data:', cashFlow);
      console.error('Trial Balance data:', trialBalance);
    } finally {
      setExporting(false);
    }
  };

  const toggleReport = (reportId: string) => {
    setSelectedReports(prev =>
      prev.includes(reportId)
        ? prev.filter(id => id !== reportId)
        : [...prev, reportId]
    );
  };

  const selectAllReports = () => {
    setSelectedReports(['income-statement', 'balance-sheet', 'cash-flow', 'trial-balance']);
  };

  // Generate year options (current year and 5 years back)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Scale className="h-8 w-8 text-primary" />
              Accounting Reports
            </h1>
            <p className="text-muted-foreground mt-1">
              Professional financial statements and accounting reports
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full sm:w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(year => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            {period === 'custom' && (
              <>
                <div className="w-full sm:w-auto">
                  <Label htmlFor="accounting-from-date" className="sr-only">From date</Label>
                  <Input
                    id="accounting-from-date"
                    type="date"
                    value={customFromDate}
                    onChange={(event) => setCustomFromDate(event.target.value)}
                  />
                </div>
                <div className="w-full sm:w-auto">
                  <Label htmlFor="accounting-to-date" className="sr-only">To date</Label>
                  <Input
                    id="accounting-to-date"
                    type="date"
                    value={customToDate}
                    onChange={(event) => setCustomToDate(event.target.value)}
                  />
                </div>
              </>
            )}
            {branches.length > 1 && (
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches (company books)</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" onClick={() => setShowExportDialog(true)} className="w-full sm:w-auto">
              <FileText className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
            <TabsTrigger value="income-statement" className="flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-2.5 sm:py-2 px-2 sm:px-4">
              <FileText className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Income Statement</span>
              <span className="sm:hidden">Income</span>
            </TabsTrigger>
            <TabsTrigger value="balance-sheet" className="flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-2.5 sm:py-2 px-2 sm:px-4">
              <BarChart3 className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Balance Sheet</span>
              <span className="sm:hidden">Balance</span>
            </TabsTrigger>
            <TabsTrigger value="cash-flow" className="flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-2.5 sm:py-2 px-2 sm:px-4">
              <DollarSign className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Cash Flow</span>
              <span className="sm:hidden">Cash</span>
            </TabsTrigger>
            <TabsTrigger value="trial-balance" className="flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-2.5 sm:py-2 px-2 sm:px-4">
              <Scale className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Trial Balance</span>
              <span className="sm:hidden">Trial</span>
            </TabsTrigger>
          </TabsList>

          {/* Income Statement Tab */}
          <TabsContent value="income-statement" className="space-y-6">
            {loading ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">Loading...</p>
                </CardContent>
              </Card>
            ) : incomeStatement ? (
              <>
                {/* Summary Cards */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">
                        {formatUGX(incomeStatement.revenue.total ?? incomeStatement.revenue.net_revenue ?? 0)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {incomeStatement.revenue.order_count} orders
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Gross Profit
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-blue-600">
                        {formatUGX(incomeStatement.gross_profit)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Net Profit
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${incomeStatement.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatUGX(incomeStatement.net_profit)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {incomeStatement.profit_margin}% margin
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Salaries
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {formatUGX(incomeStatement.salaries.total)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {incomeStatement.salaries.payment_count} payments
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {branchFilter === 'all' && branchSummary && branchSummary.branches.length > 1 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>By Branch</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Location snapshot for this period. The figures above remain the combined company books.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="py-2 pr-4">Branch</th>
                              <th className="py-2 pr-4 text-right">Orders</th>
                              <th className="py-2 pr-4 text-right">Revenue</th>
                              <th className="py-2 pr-4 text-right">Expenses</th>
                              <th className="py-2 text-right">Net</th>
                            </tr>
                          </thead>
                          <tbody>
                            {branchSummary.branches.map((row) => (
                              <tr key={row.branch_id} className="border-b last:border-0">
                                <td className="py-2 pr-4 font-medium">{row.branch_name}</td>
                                <td className="py-2 pr-4 text-right">{row.order_count}</td>
                                <td className="py-2 pr-4 text-right">{formatUGX(row.revenue)}</td>
                                <td className="py-2 pr-4 text-right">{formatUGX(row.expenses)}</td>
                                <td className={`py-2 text-right font-semibold ${row.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatUGX(row.net_profit)}
                                </td>
                              </tr>
                            ))}
                            <tr className="font-semibold">
                              <td className="py-2 pr-4">Company total</td>
                              <td className="py-2 pr-4 text-right">{branchSummary.overall.order_count}</td>
                              <td className="py-2 pr-4 text-right">{formatUGX(branchSummary.overall.revenue)}</td>
                              <td className="py-2 pr-4 text-right">{formatUGX(branchSummary.overall.expenses)}</td>
                              <td className="py-2 text-right">{formatUGX(branchSummary.overall.net_profit)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Detailed P&L Statement */}
                <Card>
                  <CardHeader>
                    <CardTitle>Income Statement (Profit & Loss)</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Period: {incomeStatement.period}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Revenue Section */}
                      <div className="border-b pb-4">
                        <h3 className="font-semibold text-lg mb-2">Revenue</h3>
                        {incomeStatement.revenue.by_category.map((cat: RevenueCategory) => (
                          <div key={cat.category} className="flex justify-between py-1 pl-4">
                            <span className="text-sm">{cat.category}</span>
                            <span className="text-sm font-medium">{formatUGX(cat.revenue)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between font-bold mt-2 pt-2 border-t">
                          <span>Total Revenue</span>
                          <span className="text-green-600">{formatUGX(incomeStatement.revenue.total ?? incomeStatement.revenue.net_revenue ?? 0)}</span>
                        </div>

                        {/* VAT Breakdown (if available) */}
                        {incomeStatement.vat_summary && incomeStatement.vat_summary.total_vat_collected > 0 && (
                          <div className="mt-3 pt-3 border-t bg-blue-50 dark:bg-blue-950/20 -mx-4 px-4 py-3 rounded">
                            <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">VAT / Tax Breakdown</div>
                            <div className="flex justify-between py-1 text-sm">
                              <span className="text-blue-600 dark:text-blue-400">Revenue (Gross - Inc. VAT)</span>
                              <span className="font-medium">{formatUGX(incomeStatement.vat_summary.revenue_inc_vat)}</span>
                            </div>
                            <div className="flex justify-between py-1 text-sm">
                              <span className="text-blue-600 dark:text-blue-400">Revenue (Net - Exc. VAT)</span>
                              <span className="font-medium">{formatUGX(incomeStatement.vat_summary.revenue_exc_vat)}</span>
                            </div>
                            <div className="flex justify-between py-1 text-sm font-semibold border-t border-blue-200 dark:border-blue-800 pt-2 mt-1">
                              <span className="text-blue-700 dark:text-blue-300">VAT Collected (Liability)</span>
                              <span className="text-orange-600 dark:text-orange-400">{formatUGX(incomeStatement.vat_summary.total_vat_collected)}</span>
                            </div>
                            <div className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                              {incomeStatement.vat_summary.orders_with_vat} orders with VAT applied
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Cost of Goods Sold */}
                      <div className="border-b pb-4">
                        <h3 className="font-semibold text-lg mb-2">Cost of Goods Sold</h3>
                        <div className="flex justify-between py-1 pl-4">
                          <span className="text-sm">Direct Costs</span>
                          <span className="text-sm font-medium">{formatUGX(incomeStatement.cost_of_goods_sold)}</span>
                        </div>
                      </div>

                      {/* Gross Profit */}
                      <div className="border-b pb-4">
                        <div className="flex justify-between font-bold text-lg">
                          <span>Gross Profit</span>
                          <span className="text-blue-600">{formatUGX(incomeStatement.gross_profit)}</span>
                        </div>
                      </div>

                      {/* Operating Expenses */}
                      <div className="border-b pb-4">
                        <h3 className="font-semibold text-lg mb-2">Operating Expenses</h3>
                        {incomeStatement.operating_expenses.by_category.map((exp: ExpenseCategory) => (
                          <div key={exp.category} className="flex justify-between py-1 pl-4">
                            <span className="text-sm">{exp.category}</span>
                            <span className="text-sm font-medium text-red-600">({formatUGX(exp.amount)})</span>
                          </div>
                        ))}
                        <div className="flex justify-between font-semibold mt-2 pt-2 border-t">
                          <span>Total Operating Expenses</span>
                          <span className="text-red-600">({formatUGX(incomeStatement.operating_expenses.total)})</span>
                        </div>
                      </div>

                      {/* Salaries */}
                      <div className="border-b pb-4">
                        <div className="flex justify-between">
                          <span className="font-semibold">Salaries & Wages</span>
                          <span className="font-medium text-red-600">({formatUGX(incomeStatement.salaries.total)})</span>
                        </div>
                      </div>

                      {/* Net Profit */}
                      <div className="bg-muted p-4 rounded-lg">
                        <div className="flex justify-between font-bold text-xl">
                          <span>Net Profit</span>
                          <span className={incomeStatement.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatUGX(incomeStatement.net_profit)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Profit Margin: {incomeStatement.profit_margin}%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No data available</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Balance Sheet Tab */}
          <TabsContent value="balance-sheet" className="space-y-6">
            {loading ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">Loading...</p>
                </CardContent>
              </Card>
            ) : balanceSheet ? (
              <>
                {/* Summary Cards */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Assets
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-blue-600">
                        {formatUGX(balanceSheet.assets.total_assets)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Liabilities
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-600">
                        {formatUGX(balanceSheet.liabilities.total_liabilities)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Equity
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">
                        {formatUGX(balanceSheet.equity.total_equity)}
                      </div>
                      {balanceSheet.balance_check.balanced ? (
                        <p className="text-xs text-green-600 mt-1">✓ Balanced</p>
                      ) : (
                        <p className="text-xs text-red-600 mt-1">⚠ Not Balanced</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Detailed Balance Sheet */}
                <Card>
                  <CardHeader>
                    <CardTitle>Balance Sheet</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      As of: {balanceSheet.as_of_date}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Assets */}
                      <div className="space-y-4">
                        <h3 className="font-semibold text-lg border-b pb-2">ASSETS</h3>
                        
                        <div>
                          <h4 className="font-medium mb-2">Current Assets</h4>
                          <div className="space-y-1 pl-4">
                            <div className="flex justify-between text-sm">
                              <span>Cash</span>
                              <span>{formatUGX(balanceSheet.assets.current_assets.cash)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>Accounts Receivable</span>
                              <span>{formatUGX(balanceSheet.assets.current_assets.accounts_receivable)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>Inventory</span>
                              <span>{formatUGX(balanceSheet.assets.current_assets.inventory)}</span>
                            </div>
                            <div className="flex justify-between font-medium border-t pt-1">
                              <span>Total Current Assets</span>
                              <span>{formatUGX(balanceSheet.assets.current_assets.total)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                          <div className="flex justify-between font-bold">
                            <span>TOTAL ASSETS</span>
                            <span className="text-blue-600">{formatUGX(balanceSheet.assets.total_assets)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Liabilities & Equity */}
                      <div className="space-y-4">
                        <h3 className="font-semibold text-lg border-b pb-2">LIABILITIES & EQUITY</h3>
                        
                        <div>
                          <h4 className="font-medium mb-2">Current Liabilities</h4>
                          <div className="space-y-1 pl-4">
                            <div className="flex justify-between text-sm">
                              <span>Accounts Payable</span>
                              <span>{formatUGX(balanceSheet.liabilities.current_liabilities.accounts_payable)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>Accrued Salaries</span>
                              <span>{formatUGX(balanceSheet.liabilities.current_liabilities.accrued_salaries)}</span>
                            </div>
                            <div className="flex justify-between font-medium border-t pt-1">
                              <span>Total Liabilities</span>
                              <span>{formatUGX(balanceSheet.liabilities.total_liabilities)}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Equity</h4>
                          <div className="space-y-1 pl-4">
                            <div className="flex justify-between text-sm">
                              <span>Retained Earnings</span>
                              <span>{formatUGX(balanceSheet.equity.retained_earnings)}</span>
                            </div>
                            <div className="flex justify-between font-medium border-t pt-1">
                              <span>Total Equity</span>
                              <span>{formatUGX(balanceSheet.equity.total_equity)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                          <div className="flex justify-between font-bold">
                            <span>TOTAL LIABILITIES & EQUITY</span>
                            <span className="text-green-600">
                              {formatUGX(balanceSheet.liabilities.total_liabilities + balanceSheet.equity.total_equity)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No data available</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Cash Flow Tab */}
          <TabsContent value="cash-flow" className="space-y-6">
            {loading ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">Loading...</p>
                </CardContent>
              </Card>
            ) : cashFlow ? (
              <Card>
                <CardHeader>
                  <CardTitle>Cash Flow Statement</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Period: {cashFlow.period}
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Operating Activities */}
                  <div className="border-b pb-4">
                    <h3 className="font-semibold text-lg mb-3">Cash Flow from Operating Activities</h3>
                    <div className="space-y-2 pl-4">
                      <div className="flex justify-between text-sm">
                        <span>Cash received from customers</span>
                        <span className="text-green-600">{formatUGX(cashFlow.operating_activities.cash_from_customers)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Cash paid for expenses</span>
                        <span className="text-red-600">{formatUGX(cashFlow.operating_activities.cash_paid_for_expenses)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Cash paid for salaries</span>
                        <span className="text-red-600">{formatUGX(cashFlow.operating_activities.cash_paid_for_salaries)}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t pt-2">
                        <span>Net Cash from Operating Activities</span>
                        <span className={cashFlow.operating_activities.net_cash_from_operations >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {formatUGX(cashFlow.operating_activities.net_cash_from_operations)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Investing Activities */}
                  <div className="border-b pb-4">
                    <h3 className="font-semibold text-lg mb-3">Cash Flow from Investing Activities</h3>
                    <div className="space-y-2 pl-4">
                      <div className="flex justify-between text-sm">
                        <span>Purchase of inventory</span>
                        <span className="text-red-600">{formatUGX(cashFlow.investing_activities.inventory_purchases)}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t pt-2">
                        <span>Net Cash from Investing Activities</span>
                        <span className="text-red-600">{formatUGX(cashFlow.investing_activities.net_cash_from_investing)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net Cash Flow */}
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex justify-between font-bold text-xl mb-2">
                      <span>Net Increase in Cash</span>
                      <span className={cashFlow.net_increase_in_cash >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatUGX(cashFlow.net_increase_in_cash)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Cash at End of Period</span>
                      <span className="font-semibold">{formatUGX(cashFlow.cash_at_end)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No data available</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Trial Balance Tab */}
          <TabsContent value="trial-balance" className="space-y-6">
            {loading ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">Loading...</p>
                </CardContent>
              </Card>
            ) : trialBalance ? (
              <Card>
                <CardHeader>
                  <CardTitle>Trial Balance</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    As of: {trialBalance.as_of_date}
                  </p>
                  {trialBalance.totals.balanced ? (
                    <p className="text-sm text-green-600">✓ Books are balanced</p>
                  ) : (
                    <p className="text-sm text-red-600">⚠ Books are not balanced {trialBalance.totals.difference !== undefined && `(Difference: ${formatUGX(trialBalance.totals.difference)})`}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 whitespace-nowrap">Account Code</th>
                          <th className="text-left py-2 whitespace-nowrap">Account Name</th>
                          <th className="text-right py-2 whitespace-nowrap">Debit</th>
                          <th className="text-right py-2 whitespace-nowrap">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trialBalance.accounts.map((account: TrialBalanceAccount, index: number) => (
                          <tr key={index} className="border-b">
                            <td className="py-2 text-sm whitespace-nowrap">{account.account_code}</td>
                            <td className="py-2">{account.account_name}</td>
                            <td className="py-2 text-right whitespace-nowrap">{account.debit > 0 ? formatUGX(account.debit) : '-'}</td>
                            <td className="py-2 text-right whitespace-nowrap">{account.credit > 0 ? formatUGX(account.credit) : '-'}</td>
                          </tr>
                        ))}
                        <tr className="font-bold bg-muted">
                          <td className="py-3">TOTAL</td>
                          <td className="py-3"></td>
                          <td className="py-3 text-right whitespace-nowrap">{formatUGX(trialBalance.totals.total_debits)}</td>
                          <td className="py-3 text-right whitespace-nowrap">{formatUGX(trialBalance.totals.total_credits)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No data available</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Export Dialog */}
        <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Export as PDF
              </DialogTitle>
              <DialogDescription>
                Select which reports to export as PDF for {period} ({selectedYear}). PDF files can be viewed in your browser and easily printed.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Select Reports:</Label>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={selectAllReports}
                >
                  Select All
                </Button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="income-statement"
                    checked={selectedReports.includes('income-statement')}
                    onCheckedChange={() => toggleReport('income-statement')}
                  />
                  <Label htmlFor="income-statement" className="flex items-center gap-2 cursor-pointer">
                    <FileText className="h-4 w-4 text-blue-500" />
                    Income Statement
                  </Label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="balance-sheet"
                    checked={selectedReports.includes('balance-sheet')}
                    onCheckedChange={() => toggleReport('balance-sheet')}
                  />
                  <Label htmlFor="balance-sheet" className="flex items-center gap-2 cursor-pointer">
                    <Scale className="h-4 w-4 text-green-500" />
                    Balance Sheet
                  </Label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="cash-flow"
                    checked={selectedReports.includes('cash-flow')}
                    onCheckedChange={() => toggleReport('cash-flow')}
                  />
                  <Label htmlFor="cash-flow" className="flex items-center gap-2 cursor-pointer">
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                    Cash Flow Statement
                  </Label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="trial-balance"
                    checked={selectedReports.includes('trial-balance')}
                    onCheckedChange={() => toggleReport('trial-balance')}
                  />
                  <Label htmlFor="trial-balance" className="flex items-center gap-2 cursor-pointer">
                    <DollarSign className="h-4 w-4 text-purple-500" />
                    Trial Balance
                  </Label>
                </div>
              </div>

              {selectedReports.length > 0 && (
                <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                  {selectedReports.length} report(s) selected
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowExportDialog(false);
                  setSelectedReports([]);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleExport}
                disabled={selectedReports.length === 0 || exporting}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                {exporting ? 'Generating PDF...' : `Export as PDF ${selectedReports.length > 0 ? `(${selectedReports.length})` : ''}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

import { MainLayout } from '@/components/layout/MainLayout';
import { API_BASE_URL } from '@/lib/api';
import { BarChart3, TrendingUp, DollarSign, Users, ShoppingCart, Calendar, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { formatUGX } from '@/lib/currency';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Extend jsPDF type for lastAutoTable
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable?: { finalY: number };
  }
}

interface ReportData {
  summary: {
    total_orders: number;
    total_revenue: number;
    avg_order_value: number;
    total_discounts: number;
  };
  daily_revenue: Array<{
    date: string;
    order_count: number;
    revenue: number;
    avg_order_value: number;
  }>;
  category_revenue: Array<{
    category: string;
    order_count: number;
    revenue: number;
  }>;
  top_customers: Array<{
    id: number;
    name: string;
    phone: string;
    order_count: number;
    total_spent: number;
  }>;
  status_distribution: Array<{
    status: string;
    count: number;
  }>;
}

interface StaffPerformanceData {
  staff_stats: Array<{
    id: number;
    staff_name: string;
    role: string;
    total_orders: number;
    total_revenue: number | string;
    avg_order_value: number | string;
    total_discounts_given: number | string;
    total_bargains_given: number | string;
  }>;
  daily_staff_performance: Array<{
    date: string;
    staff_name: string;
    order_count: number;
    revenue: number;
  }>;
}

interface VATSummaryData {
  summary: {
    total_orders_with_vat: number | string;
    total_vat_collected: number | string;
    avg_vat_rate: number | string;
    total_revenue_inc_vat: number | string;
    total_revenue_exc_vat: number | string;
  };
  orders_without_vat: number | string;
  daily_vat: Array<{
    date: string;
    orders_with_vat: number;
    vat_collected: number;
    total_inc_vat: number;
  }>;
  monthly_vat: Array<{
    month: string;
    month_name: string;
    orders_with_vat: number | string;
    vat_collected: number | string;
    total_inc_vat: number | string;
    total_exc_vat: number | string;
  }>;
  staff_vat_usage: Array<{
    id: number;
    staff_name: string;
    role: string;
    orders_with_vat_applied: number | string;
    total_vat_collected: number | string;
  }>;
}

export default function Reports() {
  const { token, user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformanceData | null>(null);
  const [vatSummary, setVatSummary] = useState<VATSummaryData | null>(null);
  const [downloading, setDownloading] = useState(false);
  
  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // Check if user is DESKTOP_AGENT (sees only own performance)
  const isDesktopAgent = user?.role === 'DESKTOP_AGENT';
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  // Pie chart colors
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c'];

  const fetchReportData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/reports/revenue?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReportData(response.data);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load report data',
      });
    } finally {
      setLoading(false);
    }
  }, [period, token, toast]);

  const fetchStaffPerformance = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/reports/staff-performance?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStaffPerformance(response.data);
    } catch (error: unknown) {
      console.error('Failed to load staff performance:', error);
      // Show user-friendly error
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast({
        variant: 'destructive',
        title: 'Staff Performance Error',
        description: axiosError.response?.data?.error || 'Could not load staff performance data',
      });
      setStaffPerformance(null); // Clear any stale data
    }
  }, [period, token, toast]);

  const fetchVATSummary = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/reports/vat-summary?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVatSummary(response.data);
    } catch (error: unknown) {
      console.error('❌ Failed to load VAT summary:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      console.error('Error details:', axiosError.response?.data);
      toast({
        variant: 'destructive',
        title: 'VAT Summary Error',
        description: axiosError.response?.data?.error || 'Could not load VAT summary. Check console for details.',
      });
      setVatSummary(null);
    }
  }, [period, token, toast]);

  useEffect(() => {
    // DESKTOP_AGENT only fetches their own performance
    if (isDesktopAgent) {
      setLoading(true);
      fetchStaffPerformance().finally(() => setLoading(false));
    } else {
      // ADMIN/MANAGER fetch full reports
      fetchReportData();
      fetchStaffPerformance();
      fetchVATSummary(); // Fetch VAT summary for managers/admins
    }
  }, [period, token, isDesktopAgent, fetchReportData, fetchStaffPerformance, fetchVATSummary]);

  // Format amount for PDF export
  const formatAmount = (amount: number) => {
    if (amount === undefined || amount === null || amount === 0) return 'UGX 0';
    const absAmount = Math.abs(amount);
    const formatted = `UGX ${absAmount.toLocaleString('en-UG')}`;
    return amount < 0 ? `(${formatted})` : formatted;
  };

  const handleExport = async () => {
    if (selectedSections.length === 0) {
      toast({
        title: 'No sections selected',
        description: 'Please select at least one section to export',
        variant: 'destructive',
      });
      return;
    }

    setExporting(true);
    try {
      if (!reportData) return;

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      let yPos = 20;

      // Add header
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Lush Laundry', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      doc.setFontSize(14);
      doc.text('Revenue Report', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const periodText = period === 'day' ? 'Today' : 
                        period === 'week' ? 'This Week' : 
                        period === 'month' ? 'This Month' : 
                        period === 'year' ? 'This Year' : 
                        period === 'all' ? 'All Time' : 
                        `Year ${period}`;
      doc.text(`Period: ${periodText}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 6;

      doc.text(`Generated: ${new Date().toLocaleString('en-UG')}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      // Summary Section
      if (selectedSections.includes('summary')) {
        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'SUMMARY', colSpan: 2, styles: { fillColor: [37, 99, 235] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const } }]],
          body: [
            ['Total Revenue', formatAmount(parseFloat(reportData.summary.total_revenue?.toString() || '0'))],
            ['Total Orders', reportData.summary.total_orders?.toString() || '0'],
            ['Average Order Value', formatAmount(parseFloat(reportData.summary.avg_order_value?.toString() || '0'))],
            ['Total Discounts', formatAmount(parseFloat(reportData.summary.total_discounts?.toString() || '0'))],
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

      // Revenue Trend
      if (selectedSections.includes('revenue-trend') && reportData.daily_revenue) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        const trendRows = reportData.daily_revenue.map((item) => [
          new Date(item.date).toLocaleDateString('en-UG'),
          item.order_count.toString(),
          formatAmount(parseFloat(item.revenue.toString())),
          formatAmount(parseFloat(item.avg_order_value.toString())),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'REVENUE TREND', colSpan: 4, styles: { fillColor: [88, 153, 68] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const } }]],
          body: [
            [
              { content: 'Date', styles: { fontStyle: 'bold' } }, 
              { content: 'Orders', styles: { fontStyle: 'bold' } }, 
              { content: 'Revenue', styles: { fontStyle: 'bold' } }, 
              { content: 'Avg Order', styles: { fontStyle: 'bold' } }
            ],
            ...trendRows,
          ],
          theme: 'grid',
          headStyles: { fillColor: [88, 153, 68] },
        });
        yPos = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || yPos;
        yPos += 10;
      }

      // Category Breakdown
      if (selectedSections.includes('category-breakdown') && reportData.category_revenue) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        const categoryRows = reportData.category_revenue.map((item) => [
          item.category,
          item.order_count.toString(),
          formatAmount(parseFloat(item.revenue.toString())),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'REVENUE BY CATEGORY', colSpan: 3, styles: { fillColor: [249, 115, 22] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const } }]],
          body: [
            [
              { content: 'Category', styles: { fontStyle: 'bold' } }, 
              { content: 'Orders', styles: { fontStyle: 'bold' } }, 
              { content: 'Revenue', styles: { fontStyle: 'bold' } }
            ],
            ...categoryRows,
          ],
          theme: 'grid',
          headStyles: { fillColor: [249, 115, 22] },
        });
        yPos = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || yPos;
      }

      // Top Customers
      if (selectedSections.includes('top-customers') && reportData.top_customers) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        const customerRows = reportData.top_customers.map((item) => [
          item.name,
          item.phone,
          item.order_count.toString(),
          formatAmount(parseFloat(item.total_spent.toString())),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'TOP CUSTOMERS', colSpan: 4, styles: { fillColor: [168, 85, 247] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const } }]],
          body: [
            [
              { content: 'Name', styles: { fontStyle: 'bold' } }, 
              { content: 'Phone', styles: { fontStyle: 'bold' } }, 
              { content: 'Orders', styles: { fontStyle: 'bold' } }, 
              { content: 'Total Spent', styles: { fontStyle: 'bold' } }
            ],
            ...customerRows,
          ],
          theme: 'grid',
          headStyles: { fillColor: [168, 85, 247] },
        });
      }

      // Order Status Distribution
      if (selectedSections.includes('order-status') && reportData.status_distribution) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        const statusRows = reportData.status_distribution.map((status) => [
          status.status.charAt(0) + status.status.slice(1).toLowerCase(),
          status.count.toString(),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'ORDER STATUS DISTRIBUTION', colSpan: 2, styles: { fillColor: [88, 170, 88] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const } }]],
          body: [
            [
              { content: 'Status', styles: { fontStyle: 'bold' } },
              { content: 'Count', styles: { fontStyle: 'bold' } },
            ],
            ...statusRows,
          ],
          theme: 'grid',
          headStyles: { fillColor: [88, 170, 88] },
        });
        yPos = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || yPos;
      }

      // Staff Performance
      if (selectedSections.includes('staff-performance') && staffPerformance?.staff_stats) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        const staffRows = staffPerformance.staff_stats.map((staff) => [
          staff.staff_name,
          staff.role === 'DESKTOP_AGENT' ? 'Agent' : staff.role.charAt(0) + staff.role.slice(1).toLowerCase(),
          staff.total_orders.toString(),
          formatAmount(parseFloat(staff.total_revenue.toString())),
          formatAmount(Math.round(parseFloat(staff.avg_order_value.toString()))),
          formatAmount(parseFloat(staff.total_discounts_given.toString())),
          formatAmount(parseFloat(staff.total_bargains_given.toString())),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'STAFF PERFORMANCE', colSpan: 7, styles: { fillColor: [34, 197, 94] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const } }]],
          body: [
            [
              { content: 'Staff Member', styles: { fontStyle: 'bold' } },
              { content: 'Role', styles: { fontStyle: 'bold' } },
              { content: 'Orders', styles: { fontStyle: 'bold' } },
              { content: 'Revenue', styles: { fontStyle: 'bold' } },
              { content: 'Avg Order', styles: { fontStyle: 'bold' } },
              { content: 'Discounts', styles: { fontStyle: 'bold' } },
              { content: 'Bargains', styles: { fontStyle: 'bold' } },
            ],
            ...staffRows,
          ],
          theme: 'grid',
          headStyles: { fillColor: [34, 197, 94] },
        });
      }

      // Save PDF
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `lush-laundry-report-${periodText.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.pdf`;
      doc.save(filename);

      toast({
        title: 'Report Exported',
        description: 'PDF report downloaded successfully',
      });
      setShowExportDialog(false);
    } catch (error) {
      console.error('Export error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to export PDF report',
      });
    } finally {
      setExporting(false);
    }
  };

  const downloadPDFReport = () => {
    setShowExportDialog(true);
  };

  const [showCSVExportDialog, setShowCSVExportDialog] = useState(false);

  const downloadCSVReport = async () => {
    if (selectedSections.length === 0) {
      toast({
        title: 'No sections selected',
        description: 'Please select at least one section to export',
        variant: 'destructive',
      });
      return;
    }

    try {
      setDownloading(true);
      
      if (!reportData) return;
      
      // Initialize CSV content
      let csv = 'LUSH LAUNDRY REPORT\n';
      
      const periodText: string = period === 'day' ? 'Today' : 
                        period === 'week' ? 'This Week' : 
                        period === 'month' ? 'This Month' : 
                        period === 'year' ? 'This Year' : 
                        period === 'all' ? 'All Time' : 
                        `Year ${period}`;
      
      csv += `Period: ${periodText}\n`;
      csv += `Generated: ${new Date().toLocaleString('en-UG')}\n\n`;
      
      // Summary
      if (selectedSections.includes('summary')) {
        csv += 'SUMMARY\n';
        csv += 'Metric,Value\n';
        csv += `Total Orders,${reportData.summary.total_orders}\n`;
        csv += `Total Revenue,${formatUGX(reportData.summary.total_revenue)}\n`;
        csv += `Average Order Value,${formatUGX(reportData.summary.avg_order_value)}\n`;
        csv += `Total Discounts,${formatUGX(reportData.summary.total_discounts)}\n\n`;
      }
      
      // Revenue Trend
      if (selectedSections.includes('revenue-trend') && reportData.daily_revenue) {
        csv += 'REVENUE TREND\n';
        csv += 'Date,Orders,Revenue,Avg Order Value\n';
        reportData.daily_revenue.forEach(row => {
          csv += `${new Date(row.date).toLocaleDateString('en-UG')},${row.order_count},${parseFloat(row.revenue.toString())},${parseFloat(row.avg_order_value.toString())}\n`;
        });
        csv += '\n';
      }
      
      // Category Breakdown
      if (selectedSections.includes('category-breakdown') && reportData.category_revenue) {
        csv += 'REVENUE BY CATEGORY\n';
        csv += 'Category,Orders,Revenue\n';
        reportData.category_revenue.forEach(row => {
          csv += `${row.category},${row.order_count},${parseFloat(row.revenue.toString())}\n`;
        });
        csv += '\n';
      }

      // Top Customers
      if (selectedSections.includes('top-customers') && reportData.top_customers) {
        csv += 'TOP CUSTOMERS\n';
        csv += 'Name,Phone,Orders,Total Spent\n';
        reportData.top_customers.forEach(row => {
          csv += `${row.name},${row.phone},${row.order_count},${parseFloat(row.total_spent.toString())}\n`;
        });
        csv += '\n';
      }

      // Order Status Distribution
      if (selectedSections.includes('order-status') && reportData.status_distribution) {
        csv += 'ORDER STATUS DISTRIBUTION\n';
        csv += 'Status,Count\n';
        reportData.status_distribution.forEach(status => {
          csv += `${status.status.charAt(0) + status.status.slice(1).toLowerCase()},${status.count}\n`;
        });
        csv += '\n';
      }

      // Staff Performance
      if (selectedSections.includes('staff-performance') && staffPerformance?.staff_stats) {
        csv += 'STAFF PERFORMANCE\n';
        csv += 'Staff Member,Role,Orders,Revenue,Avg Order,Discounts,Bargains\n';
        staffPerformance.staff_stats.forEach(staff => {
          const roleDisplay = staff.role === 'DESKTOP_AGENT' ? 'Agent' : staff.role.charAt(0) + staff.role.slice(1).toLowerCase();
          csv += `${staff.staff_name},${roleDisplay},${staff.total_orders},${parseFloat(staff.total_revenue.toString())},${parseFloat(staff.avg_order_value.toString())},${parseFloat(staff.total_discounts_given.toString())},${parseFloat(staff.total_bargains_given.toString())}\n`;
        });
      }
      
      // Create download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.setAttribute('download', `lush-laundry-report-${periodText.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: 'Report Exported',
        description: 'CSV report has been downloaded successfully',
      });
      setShowCSVExportDialog(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to export report',
      });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout title="Reports" subtitle={isDesktopAgent ? "My Performance" : "Business analytics and insights"}>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading reports...</p>
        </div>
      </MainLayout>
    );
  }

  // For ADMIN/MANAGER, check if reportData exists
  if (isManagerOrAdmin && !reportData) {
    return (
      <MainLayout title="Reports" subtitle="Business analytics and insights">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading reports...</p>
        </div>
      </MainLayout>
    );
  }

  const { summary, daily_revenue, category_revenue } = reportData || { summary: null, daily_revenue: [], category_revenue: [] };
  
  // Format daily revenue data for chart
  const chartData = (daily_revenue || []).map(item => ({
    day: new Date(item.date).toLocaleDateString('en-GB', { weekday: 'short' }),
    revenue: parseFloat(item.revenue.toString()),
    orders: parseInt(item.order_count.toString())
  })).reverse();

  // Format category data for chart
  const categoryData = (category_revenue || []).map(item => ({
    name: item.category,
    value: parseFloat(item.revenue.toString())
  }));

  return (
    <MainLayout title="Reports" subtitle={isDesktopAgent ? "My Performance" : "Business analytics and insights"}>
      {/* Header with Period Selector and Download Buttons */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full max-w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="2025">Year 2025</SelectItem>
              <SelectItem value="2024">Year 2024</SelectItem>
              <SelectItem value="2023">Year 2023</SelectItem>
              <SelectItem value="2022">Year 2022</SelectItem>
              <SelectItem value="2021">Year 2021</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Export buttons - Hidden for DESKTOP_AGENT */}
        {isManagerOrAdmin && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCSVExportDialog(true)}
            disabled={!reportData}
            className="gap-2 flex-1 sm:flex-initial"
          >
            <FileSpreadsheet className="h-4 w-4 flex-shrink-0" />
            <span>CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadPDFReport}
            disabled={downloading || !reportData}
            className="gap-2 flex-1 sm:flex-initial"
          >
            <FileText className="h-4 w-4 flex-shrink-0" />
            <span>PDF</span>
          </Button>
        </div>
        )}
      </div>

      {/* Info Banner - Different for DESKTOP_AGENT */}
      {isDesktopAgent ? (
        <div className="mb-6 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Users className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-green-900 dark:text-green-100">My Performance Stats</h3>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                View your personal performance metrics including orders, revenue brought in, and average order value for the selected period.
              </p>
            </div>
          </div>
        </div>
      ) : (
      <div className="mb-6 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-blue-900 dark:text-blue-100">Revenue & Customer Analytics</h3>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              View detailed revenue trends, order patterns, and customer insights for the selected period.
              {isAdmin && (
                <> For professional accounting reports like Income Statement and Balance Sheet, visit the <Link to="/accounting" className="underline font-medium">Accounting</Link> section.</>
              )}
            </p>
          </div>
        </div>
      </div>
      )}

      {/* Quick Access to Accounting Reports - Admin Only */}
      {isAdmin && (
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Accounting & Financial Reports</h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          <Link to="/accounting?tab=income-statement">
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Income Statement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Profit & Loss statement showing revenue, expenses, and net profit
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/accounting?tab=balance-sheet">
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Balance Sheet
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Assets, liabilities, and equity position of the business
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/accounting?tab=cash-flow">
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Cash Flow Statement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Cash inflows and outflows from operating, investing activities
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
      )}

      {/* Summary Cards - Admin/Manager Only */}
      {isManagerOrAdmin && reportData && reportData.summary && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {formatUGX(reportData.summary.total_revenue)}
              </p>
            </div>
            <div className="p-3 bg-secondary/10 rounded-lg">
              <DollarSign className="h-6 w-6 text-secondary" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {reportData.summary.total_orders}
              </p>
            </div>
            <div className="p-3 bg-accent/10 rounded-lg">
              <ShoppingCart className="h-6 w-6 text-accent" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Avg Order Value</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {formatUGX(reportData.summary.avg_order_value)}
              </p>
            </div>
            <div className="p-3 bg-primary/10 rounded-lg">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Discounts</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {formatUGX(reportData.summary.total_discounts)}
              </p>
            </div>
            <div className="p-3 bg-success/10 rounded-lg">
              <Users className="h-6 w-6 text-success" />
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Revenue Charts and Analytics - Admin/Manager Only */}
      {isManagerOrAdmin && reportData && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Revenue Trend</h3>
              <p className="text-sm text-muted-foreground">Daily revenue breakdown</p>
            </div>
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(88, 50%, 45%)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(88, 50%, 45%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v/1000000).toFixed(1)}M`} />
                <Tooltip 
                  contentStyle={{ 
                    background: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  formatter={(value: number) => [formatUGX(value), 'Revenue']}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="hsl(88, 50%, 45%)" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Status Distribution */}
        {reportData && reportData.status_distribution && reportData.status_distribution.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-foreground">Order Status Distribution</h3>
                <p className="text-sm text-muted-foreground">Orders by current status</p>
              </div>
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportData.status_distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="status" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickFormatter={(value) => {
                      const statusNames: { [key: string]: string } = {
                        'RECEIVED': 'Received',
                        'PROCESSING': 'Processing',
                        'READY': 'Ready',
                        'DELIVERED': 'Delivered',
                        'CANCELLED': 'Cancelled'
                      };
                      return statusNames[value] ||value;
                    }}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      background: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [value, 'Orders']}
                    labelFormatter={(label) => {
                      const statusNames: { [key: string]: string } = {
                        'RECEIVED': 'Received',
                        'PROCESSING': 'Processing',
                        'READY': 'Ready',
                        'DELIVERED': 'Delivered',
                        'CANCELLED': 'Cancelled'
                      };
                      return statusNames[label] || label;
                    }}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="hsl(88, 50%, 45%)"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Category Breakdown - Pie Chart */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Revenue by Category</h3>
              <p className="text-sm text-muted-foreground">Category distribution</p>
            </div>
          </div>
          <div className="h-72 sm:h-64">
            {categoryData && categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="45%"
                    labelLine={false}
                    outerRadius={65}
                    fill="#8884d8"
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      background: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [formatUGX(value), 'Revenue']}
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
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No revenue data for this period</p>
                  <p className="text-xs mt-1">Create orders with items to see category breakdown</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Top Customers & Service Type Breakdown - Admin/Manager Only */}
      {isManagerOrAdmin && reportData && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Customers */}
        {reportData.top_customers && reportData.top_customers.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-foreground text-lg">Top Customers</h3>
                <p className="text-sm text-muted-foreground">Best customers by total spent</p>
              </div>
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            
            <div className="space-y-3">
              {reportData.top_customers.slice(0, 5).map((customer, index) => (
                <Link 
                  key={customer.id} 
                  to={`/customers?id=${customer.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                      index === 0 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300' :
                      index === 1 ? 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300' :
                      index === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {customer.name}
                      </div>
                      <div className="text-xs text-muted-foreground">{customer.phone}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-foreground">{formatUGX(parseInt(customer.total_spent.toString()))}</div>
                    <div className="text-xs text-muted-foreground">{customer.order_count} orders</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Service Type Breakdown */}
        {reportData && reportData.category_revenue && reportData.category_revenue.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-foreground text-lg">Service Type Breakdown</h3>
                <p className="text-sm text-muted-foreground">Revenue by service category</p>
              </div>
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            </div>
            
            <div className="space-y-3">
              {reportData.category_revenue.map((category, index) => {
                const totalRevenue = reportData.category_revenue.reduce((sum, c) => sum + parseFloat(c.revenue.toString()), 0);
                const percentage = (parseFloat(category.revenue.toString()) / totalRevenue) * 100;
                
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                        <span className="font-medium text-foreground">{category.category}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-foreground">{formatUGX(parseInt(category.revenue.toString()))}</span>
                        <span className="text-xs text-muted-foreground ml-2">({percentage.toFixed(1)}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="h-2 rounded-full transition-all duration-500" 
                        style={{ 
                          width: `${percentage}%`,
                          backgroundColor: COLORS[index % COLORS.length]
                        }}
                      ></div>
                    </div>
                    <div className="text-xs text-muted-foreground">{category.order_count} orders</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Staff Performance Section - Shows for all roles (filtered on backend) */}
      {staffPerformance && staffPerformance.staff_stats && staffPerformance.staff_stats.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 mt-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground text-lg">
                {isDesktopAgent ? 'My Performance' : 'Staff Performance'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isDesktopAgent ? 'Your productivity and performance metrics' : 'Monitor team productivity and performance metrics'}
              </p>
            </div>
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Staff Member</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Role</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Orders</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Revenue</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Avg Order</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Discounts</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Bargains</th>
                </tr>
              </thead>
              <tbody>
                {staffPerformance.staff_stats.map((staff) => (
                  <tr key={staff.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground">{staff.staff_name}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        staff.role === 'ADMIN' 
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300'
                          : staff.role === 'MANAGER'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
                      }`}>
                        {staff.role === 'DESKTOP_AGENT' ? 'Agent' : staff.role.charAt(0) + staff.role.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="text-right py-3 px-4 text-foreground font-medium">
                      {staff.total_orders}
                    </td>
                    <td className="text-right py-3 px-4 text-foreground font-medium">
                      {formatUGX(staff.total_revenue)}
                    </td>
                    <td className="text-right py-3 px-4 text-muted-foreground">
                      {staff.total_orders > 0 ? formatUGX(staff.avg_order_value) : 'UGX 0'}
                    </td>
                    <td className="text-right py-3 px-4 text-orange-600 dark:text-orange-400">
                      {formatUGX(staff.total_discounts_given)}
                    </td>
                    <td className="text-right py-3 px-4 text-purple-600 dark:text-purple-400">
                      {formatUGX(staff.total_bargains_given)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border">
                <tr className="bg-muted/30">
                  <td colSpan={2} className="py-3 px-4 text-sm font-semibold text-foreground">Total</td>
                  <td className="text-right py-3 px-4 text-foreground font-bold">
                    {staffPerformance.staff_stats.reduce((sum, s) => sum + Number(s.total_orders), 0).toLocaleString()}
                  </td>
                  <td className="text-right py-3 px-4 text-foreground font-bold">
                    {formatUGX(staffPerformance.staff_stats.reduce((sum, s) => sum + Number(s.total_revenue), 0))}
                  </td>
                  <td className="text-right py-3 px-4 text-muted-foreground">—</td>
                  <td className="text-right py-3 px-4 text-orange-600 dark:text-orange-400 font-semibold">
                    {formatUGX(staffPerformance.staff_stats.reduce((sum, s) => sum + Number(s.total_discounts_given), 0))}
                  </td>
                  <td className="text-right py-3 px-4 text-purple-600 dark:text-purple-400 font-semibold">
                    {formatUGX(staffPerformance.staff_stats.reduce((sum, s) => sum + Number(s.total_bargains_given), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Staff Performance Insights */}
          {staffPerformance.staff_stats.length > 0 && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-success/10 rounded-lg p-4 border border-success/20">
                <div className="text-xs text-muted-foreground mb-1">Top Performer</div>
                <div className="font-semibold text-foreground break-words">
                  {staffPerformance.staff_stats[0].staff_name}
                </div>
                <div className="text-sm text-success font-medium mt-1">
                  {formatUGX(staffPerformance.staff_stats[0].total_revenue)} revenue
                </div>
              </div>
              
              <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                <div className="text-xs text-muted-foreground mb-1">Total Team Orders</div>
                <div className="font-semibold text-foreground text-2xl">
                  {staffPerformance.staff_stats.reduce((sum, s) => sum + Number(s.total_orders), 0).toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground mt-1">across all staff</div>
              </div>
              
              <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                <div className="text-xs text-muted-foreground mb-1">Team Revenue</div>
                <div className="font-semibold text-foreground text-xl">
                  {formatUGX(staffPerformance.staff_stats.reduce((sum, s) => sum + Number(s.total_revenue), 0))}
                </div>
                <div className="text-sm text-muted-foreground mt-1">total generated</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VAT / Tax Summary Section - Admin & Manager Only */}
      {isManagerOrAdmin && vatSummary && (
        <div className="bg-card rounded-xl border border-border p-6 mt-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" />
                VAT / Tax Summary
                <span className="text-xs font-normal bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                  {period === 'day' && 'Today'}
                  {period === 'week' && 'This Week'}
                  {period === 'month' && 'This Month'}
                  {period === 'year' && 'This Year'}
                  {period === 'all' && 'All Time'}
                  {!['day', 'week', 'month', 'year', 'all'].includes(period) && `Year ${period}`}
                </span>
              </h3>
              <p className="text-sm text-muted-foreground">
                Track VAT collected for URA monthly filing and compliance reporting
              </p>
            </div>
          </div>

          {/* Show message if no VAT data yet */}
          {parseInt(vatSummary.summary.total_vat_collected as string || '0') === 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-yellow-900 dark:text-yellow-100 mb-1">No VAT Data Yet</h4>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    No orders with VAT found for the selected period. To see VAT tracking:
                  </p>
                  <ul className="text-sm text-yellow-800 dark:text-yellow-200 mt-2 ml-4 list-disc">
                    <li>Go to <strong>New Order</strong> page</li>
                    <li>Create an order and check <strong>"Apply VAT (18%) to this order"</strong> checkbox</li>
                    <li>Come back here to see VAT summary and monthly breakdown</li>
                  </ul>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
                    Or enable global URA Compliance in Settings → URA Compliance
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* VAT Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="text-xs text-green-700 dark:text-green-400 mb-1">Total VAT Collected</div>
              <div className="font-bold text-2xl text-green-900 dark:text-green-100">
                {formatUGX(vatSummary.summary.total_vat_collected)}
              </div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                Avg: {Number(vatSummary.summary.avg_vat_rate || 0).toFixed(1)}% rate
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="text-xs text-blue-700 dark:text-blue-400 mb-1">Orders with VAT</div>
              <div className="font-bold text-2xl text-blue-900 dark:text-blue-100">
                {Number(vatSummary.summary.total_orders_with_vat || 0).toLocaleString()}
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                VAT invoices issued
              </div>
            </div>

            <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <div className="text-xs text-orange-700 dark:text-orange-400 mb-1">Orders without VAT</div>
              <div className="font-bold text-2xl text-orange-900 dark:text-orange-100">
                {Number(vatSummary.orders_without_vat || 0).toLocaleString()}
              </div>
              <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                Non-VAT transactions
              </div>
            </div>

            <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
              <div className="text-xs text-purple-700 dark:text-purple-400 mb-1">Revenue (Exc. VAT)</div>
              <div className="font-bold text-xl text-purple-900 dark:text-purple-100">
                {formatUGX(vatSummary.summary.total_revenue_exc_vat)}
              </div>
              <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                Net before tax
              </div>
            </div>
          </div>

          {/* Staff VAT Usage Table */}
          {vatSummary.staff_vat_usage && vatSummary.staff_vat_usage.length > 0 && (
            <div className="mt-6">
              <h4 className="font-semibold text-foreground mb-3">Staff VAT Application Tracking</h4>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Staff Member</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Role</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Orders with VAT</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">VAT Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatSummary.staff_vat_usage.map((staff) => (
                      <tr key={staff.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                        <td className="py-3 px-4 font-medium text-foreground">{staff.staff_name}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            staff.role === 'ADMIN' 
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300'
                              : staff.role === 'MANAGER'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
                          }`}>
                            {staff.role === 'DESKTOP_AGENT' ? 'Agent' : staff.role.charAt(0) + staff.role.slice(1).toLowerCase()}
                          </span>
                        </td>
                        <td className="text-right py-3 px-4 font-medium text-foreground">
                          {Number(staff.orders_with_vat_applied).toLocaleString()}
                        </td>
                        <td className="text-right py-3 px-4 font-bold text-green-600 dark:text-green-400">
                          {formatUGX(staff.total_vat_collected)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border">
                    <tr className="bg-muted/30">
                      <td colSpan={2} className="py-3 px-4 text-sm font-semibold text-foreground">Total</td>
                      <td className="text-right py-3 px-4 text-foreground font-bold">
                        {vatSummary.staff_vat_usage.reduce((sum, s) => sum + Number(s.orders_with_vat_applied), 0).toLocaleString()}
                      </td>
                      <td className="text-right py-3 px-4 text-green-600 dark:text-green-400 font-bold">
                        {formatUGX(vatSummary.staff_vat_usage.reduce((sum, s) => sum + Number(s.total_vat_collected), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Monthly VAT Breakdown - For URA Monthly Filing */}
          {vatSummary.monthly_vat && vatSummary.monthly_vat.length > 0 && (
            <div className="mt-6">
              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-green-600" />
                Monthly VAT Breakdown (URA Filing)
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                In Uganda, VAT must be filed monthly by the 15th of the following month. Use this table to prepare your monthly URA tax returns.
              </p>
              <div className="border border-border rounded-lg overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead className="bg-muted/50">
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Month</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Orders</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Revenue (Inc. VAT)</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-foreground whitespace-nowrap">Revenue (Exc. VAT)</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-green-700 dark:text-green-400 whitespace-nowrap">VAT Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatSummary.monthly_vat.map((month) => (
                      <tr key={month.month} className="border-b border-border hover:bg-muted/30">
                        <td className="py-3 px-4 font-medium text-foreground">{month.month_name}</td>
                        <td className="text-right py-3 px-4 text-muted-foreground">
                          {Number(month.orders_with_vat).toLocaleString()}
                        </td>
                        <td className="text-right py-3 px-4 text-foreground font-medium">
                          {formatUGX(month.total_inc_vat)}
                        </td>
                        <td className="text-right py-3 px-4 text-muted-foreground">
                          {formatUGX(month.total_exc_vat)}
                        </td>
                        <td className="text-right py-3 px-4 font-bold text-green-600 dark:text-green-400">
                          {formatUGX(month.vat_collected)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border bg-muted/30">
                    <tr>
                      <td className="py-3 px-4 text-sm font-semibold text-foreground">Total</td>
                      <td className="text-right py-3 px-4 text-foreground font-bold">
                        {vatSummary.monthly_vat.reduce((sum, m) => sum + Number(m.orders_with_vat), 0).toLocaleString()}
                      </td>
                      <td className="text-right py-3 px-4 text-foreground font-bold">
                        {formatUGX(vatSummary.monthly_vat.reduce((sum, m) => sum + Number(m.total_inc_vat), 0))}
                      </td>
                      <td className="text-right py-3 px-4 text-foreground font-bold">
                        {formatUGX(vatSummary.monthly_vat.reduce((sum, m) => sum + Number(m.total_exc_vat), 0))}
                      </td>
                      <td className="text-right py-3 px-4 text-green-600 dark:text-green-400 font-bold">
                        {formatUGX(vatSummary.monthly_vat.reduce((sum, m) => sum + Number(m.vat_collected), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Alert Banner */}
          <div className="mt-6 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">URA Monthly VAT Filing</h4>
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                  This summary shows all orders where VAT was applied (either globally via URA Compliance setting or per-order toggle). 
                  Use this report for your URA tax filings and compliance documentation.
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-100/50 dark:bg-blue-900/30 p-2 rounded border border-blue-200 dark:border-blue-700">
                  📅 <strong>Filing Deadline:</strong> VAT must be filed monthly by the <strong>15th of the following month</strong>. 
                  Use the period selector above to view "This Month" for current period or select a specific year to see monthly breakdown.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Export PDF Report
            </DialogTitle>
            <DialogDescription>
              Select the sections you want to include in your PDF export
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Select All / Clear All */}
            <div className="flex items-center justify-between pb-2 border-b">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSections(['summary', 'revenue-trend', 'order-status', 'category-breakdown', 'top-customers', 'staff-performance'])}
                className="h-8 text-xs"
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSections([])}
                className="h-8 text-xs"
              >
                Clear All
              </Button>
            </div>

            {/* Section Checkboxes */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="summary"
                  checked={selectedSections.includes('summary')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections([...selectedSections, 'summary']);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== 'summary'));
                    }
                  }}
                />
                <label
                  htmlFor="summary"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Summary Statistics
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="revenue-trend"
                  checked={selectedSections.includes('revenue-trend')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections([...selectedSections, 'revenue-trend']);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== 'revenue-trend'));
                    }
                  }}
                />
                <label
                  htmlFor="revenue-trend"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Revenue Trend
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="order-status"
                  checked={selectedSections.includes('order-status')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections([...selectedSections, 'order-status']);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== 'order-status'));
                    }
                  }}
                />
                <label
                  htmlFor="order-status"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Order Status Distribution
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="category-breakdown"
                  checked={selectedSections.includes('category-breakdown')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections([...selectedSections, 'category-breakdown']);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== 'category-breakdown'));
                    }
                  }}
                />
                <label
                  htmlFor="category-breakdown"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Category Breakdown
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="top-customers"
                  checked={selectedSections.includes('top-customers')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections([...selectedSections, 'top-customers']);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== 'top-customers'));
                    }
                  }}
                />
                <label
                  htmlFor="top-customers"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Top Customers
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="staff-performance"
                  checked={selectedSections.includes('staff-performance')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections([...selectedSections, 'staff-performance']);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== 'staff-performance'));
                    }
                  }}
                />
                <label
                  htmlFor="staff-performance"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Staff Performance
                </label>
              </div>
            </div>

            {/* Selection Count */}
            {selectedSections.length > 0 && (
              <div className="bg-muted p-3 rounded-lg text-sm">
                <span className="font-medium">{selectedSections.length}</span> section{selectedSections.length !== 1 ? 's' : ''} selected
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowExportDialog(false)}
              disabled={exporting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={exporting || selectedSections.length === 0}
              className="w-full sm:w-auto"
            >
              {exporting ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Export Dialog */}
      <Dialog open={showCSVExportDialog} onOpenChange={setShowCSVExportDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Export CSV Report
            </DialogTitle>
            <DialogDescription>
              Select the sections you want to include in your CSV export
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Select All / Clear All */}
            <div className="flex items-center justify-between pb-2 border-b">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSections(['summary', 'revenue-trend', 'order-status', 'category-breakdown', 'top-customers', 'staff-performance'])}
                className="h-8 text-xs"
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSections([])}
                className="h-8 text-xs"
              >
                Clear All
              </Button>
            </div>

            {/* Section Checkboxes */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="csv-summary"
                  checked={selectedSections.includes('summary')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections([...selectedSections, 'summary']);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== 'summary'));
                    }
                  }}
                />
                <label
                  htmlFor="csv-summary"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Summary Statistics
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="csv-revenue-trend"
                  checked={selectedSections.includes('revenue-trend')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections([...selectedSections, 'revenue-trend']);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== 'revenue-trend'));
                    }
                  }}
                />
                <label
                  htmlFor="csv-revenue-trend"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Revenue Trend
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="csv-order-status"
                  checked={selectedSections.includes('order-status')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections([...selectedSections, 'order-status']);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== 'order-status'));
                    }
                  }}
                />
                <label
                  htmlFor="csv-order-status"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Order Status Distribution
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="csv-category-breakdown"
                  checked={selectedSections.includes('category-breakdown')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections([...selectedSections, 'category-breakdown']);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== 'category-breakdown'));
                    }
                  }}
                />
                <label
                  htmlFor="csv-category-breakdown"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Category Breakdown
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="csv-top-customers"
                  checked={selectedSections.includes('top-customers')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections([...selectedSections, 'top-customers']);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== 'top-customers'));
                    }
                  }}
                />
                <label
                  htmlFor="csv-top-customers"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Top Customers
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="csv-staff-performance"
                  checked={selectedSections.includes('staff-performance')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSections([...selectedSections, 'staff-performance']);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== 'staff-performance'));
                    }
                  }}
                />
                <label
                  htmlFor="csv-staff-performance"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Staff Performance
                </label>
              </div>
            </div>

            {/* Selection Count */}
            {selectedSections.length > 0 && (
              <div className="bg-muted p-3 rounded-lg text-sm">
                <span className="font-medium">{selectedSections.length}</span> section{selectedSections.length !== 1 ? 's' : ''} selected
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCSVExportDialog(false)}
              disabled={downloading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={downloadCSVReport}
              disabled={downloading || selectedSections.length === 0}
              className="w-full sm:w-auto"
            >
              {downloading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

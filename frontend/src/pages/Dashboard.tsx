import { MainLayout } from '@/components/layout/MainLayout';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { StatCard } from '@/components/dashboard/StatCard';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import {
  ShoppingCart,
  Users,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Receipt,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';

interface DashboardStats {
  period?: string;
  totalOrders: number;
  totalRevenue: number;
  activeCustomers: number;
  averageOrderValue: number;
  pendingOrders: number;
  processingOrders: number;
  readyOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalPayments: number;
}

interface FinancialSummary {
  revenue: number;
  expenses: number;
  salaries?: number;   // payroll — admin-only display
  profit: number;
  profitMargin: number;
  outstandingBalance: number;
  orderCount: number;
}

interface PaymentMethodBreakdown {
  method: string;
  transaction_count: number;
  total_amount: number;
}

interface OutstandingBalances {
  unpaid: { count: number; total: number };
  partial: { count: number; total: number };
  overdue: { count: number; total: number };
}

interface MonthOverMonth {
  currentMonth: { revenue: number; orders: number };
  previousMonth: { revenue: number; orders: number };
  growth: { revenue: number; orders: number };
}

const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

function formatBusinessTime(time: string): string {
  const [h, m] = (time || '').split(':');
  const hour = parseInt(h);
  if (Number.isNaN(hour)) return time;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

function toMinutes(time: string): number | null {
  const [h, m] = (time || '').split(':');
  const hour = parseInt(h);
  const minute = parseInt(m);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

interface BranchPerformance {
  branch_id: number;
  branch_name: string;
  branch_code: string;
  is_active: boolean;
  total_orders: number;
  total_billed: number;
  total_collected: number;
  outstanding: number;
  delivered_orders: number;
  unpaid_orders: number;
  average_order_value: number;
}

interface RecentOrder {
  id: number;
  order_number: string;
  customer_name: string;
  total_amount: number;
  order_status: string;
  created_at: string;
  item_count: number;
}

interface BusinessHoursDay {
  open: string;
  close: string;
  closed: boolean;
}

interface BusinessHours {
  sunday: BusinessHoursDay;
  monday: BusinessHoursDay;
  tuesday: BusinessHoursDay;
  wednesday: BusinessHoursDay;
  thursday: BusinessHoursDay;
  friday: BusinessHoursDay;
  saturday: BusinessHoursDay;
}

interface DashboardCache {
  stats: DashboardStats;
  recentOrders: RecentOrder[];
  businessHours: BusinessHours | null;
  financialSummary: FinancialSummary | null;
  paymentBreakdown: PaymentMethodBreakdown[];
  outstandingBalances: OutstandingBalances | null;
  monthGrowth: MonthOverMonth | null;
  branchPerformance: BranchPerformance[];
}

function getDashboardCacheKey(period: string, isAdmin: boolean) {
  return `dashboard-cache:${period}:${isAdmin ? 'admin' : 'staff'}`;
}

function readDashboardCache(period: string, isAdmin: boolean): DashboardCache | null {
  try {
    const raw = sessionStorage.getItem(getDashboardCacheKey(period, isAdmin));
    return raw ? (JSON.parse(raw) as DashboardCache) : null;
  } catch {
    return null;
  }
}

function writeDashboardCache(period: string, isAdmin: boolean, cache: DashboardCache) {
  try {
    sessionStorage.setItem(getDashboardCacheKey(period, isAdmin), JSON.stringify(cache));
  } catch {
    // Ignore storage failures and fall back to live fetching.
  }
}

export default function Dashboard() {
  const { token, isAdmin, isCashier, user } = useAuth();
  const initialStatsPeriod = (() => {
    if (isCashier) {
      return 'today';
    }

    const saved = localStorage.getItem('dashboardStatsPeriod');
    return (saved as 'today' | 'week' | 'month' | 'year' | 'all') || 'all';
  })();
  const cachedDashboard = readDashboardCache(initialStatsPeriod, isAdmin);
  const [stats, setStats] = useState<DashboardStats>(() => cachedDashboard?.stats ?? {
    totalOrders: 0,
    totalRevenue: 0,
    activeCustomers: 0,
    averageOrderValue: 0,
    pendingOrders: 0,
    processingOrders: 0,
    readyOrders: 0,
    deliveredOrders: 0,
    cancelledOrders: 0,
    totalPayments: 0,
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>(() => cachedDashboard?.recentOrders ?? []);
  const [loading, setLoading] = useState(() => !cachedDashboard);
  const [businessHours, setBusinessHours] = useState<BusinessHours | null>(() => cachedDashboard?.businessHours ?? null);
  
  // Main period selector - controls both stats AND financial performance
  const [statsPeriod, setStatsPeriod] = useState<'today' | 'week' | 'month' | 'year' | 'all'>(() => {
    if (isCashier) {
      return 'today';
    }

    const saved = localStorage.getItem('dashboardStatsPeriod');
    return (saved as 'today' | 'week' | 'month' | 'year' | 'all') || 'all';
  });
  
  // Enhanced financial states
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(() => cachedDashboard?.financialSummary ?? null);
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentMethodBreakdown[]>(() => cachedDashboard?.paymentBreakdown ?? []);
  const [outstandingBalances, setOutstandingBalances] = useState<OutstandingBalances | null>(() => cachedDashboard?.outstandingBalances ?? null);
  const [monthGrowth, setMonthGrowth] = useState<MonthOverMonth | null>(() => cachedDashboard?.monthGrowth ?? null);
  const [branchPerformance, setBranchPerformance] = useState<BranchPerformance[]>(() => cachedDashboard?.branchPerformance ?? []);

  const TODAY_KEY = DAY_KEYS[new Date().getDay()];
  const dashboardPeriod = isCashier ? 'today' : statsPeriod;

  // Whether the shop is trading right now, per today's configured hours
  const openStatus = useMemo(() => {
    if (!businessHours) return null;
    const today = businessHours[TODAY_KEY];
    if (!today || today.closed) return { isOpen: false };

    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    if (open === null || close === null) return null;

    const now = new Date();
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    return { isOpen: minutesNow >= open && minutesNow < close };
  }, [businessHours, TODAY_KEY]);


  const formatOrderDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getFullYear() === yesterday.getFullYear() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getDate() === yesterday.getDate();

    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    if (isToday) return `Today, ${time}`;
    if (isYesterday) return `Yesterday, ${time}`;
    // Older / backdated — show full date + time
    const dateLabel = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${dateLabel} · ${time}`;
  };

  const mapOrderStatus = (dbStatus: string): 'pending' | 'processing' | 'ready' | 'delivered' => {
    const statusMap: Record<string, 'pending' | 'processing' | 'ready' | 'delivered'> = {
      'RECEIVED': 'pending',
      'PROCESSING': 'processing',
      'READY': 'ready',
      'DELIVERED': 'delivered',
    };
    return statusMap[dbStatus] || 'pending';
  };

  // Save statsPeriod to localStorage whenever it changes
  useEffect(() => {
    if (isCashier) {
      localStorage.removeItem('dashboardStatsPeriod');
      return;
    }

    localStorage.setItem('dashboardStatsPeriod', statsPeriod);
  }, [statsPeriod, isCashier]);

  // Fetch dashboard data (memoized to prevent unnecessary re-renders)
  const fetchDashboardData = useCallback(async () => {
    if (!token) return;
    
    try {
      const hasCachedData = Boolean(readDashboardCache(dashboardPeriod, isAdmin));
      if (!hasCachedData) {
        setLoading(true);
      }
      
      // Fetch all data in parallel
      const requests = [
        axios.get(`${API_BASE_URL}/dashboard/stats?period=${dashboardPeriod}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE_URL}/dashboard/recent-orders`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit: 10 }
        }),
        axios.get(`${API_BASE_URL}/settings/business-hours`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ];

      // Only fetch financial data for admins
      if (isAdmin) {
        requests.push(
          axios.get(`${API_BASE_URL}/dashboard/financial-summary?period=${dashboardPeriod}`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API_BASE_URL}/dashboard/payment-methods-breakdown?period=${dashboardPeriod}`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API_BASE_URL}/dashboard/outstanding-balances`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API_BASE_URL}/dashboard/month-over-month`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        );
      }

      const responses = await Promise.all(requests);
      
      setStats(responses[0].data);
      setRecentOrders(responses[1].data.orders || []);
      setBusinessHours(responses[2].data);
      
      // Set financial data only if admin
      if (isAdmin && responses.length > 3) {
        setFinancialSummary(responses[3].data);
        setPaymentBreakdown(responses[4].data);
        setOutstandingBalances(responses[5].data);
        setMonthGrowth(responses[6].data);
      }

      writeDashboardCache(dashboardPeriod, isAdmin, {
        stats: responses[0].data,
        recentOrders: responses[1].data.orders || [],
        businessHours: responses[2].data,
        financialSummary: isAdmin && responses.length > 3 ? responses[3].data : null,
        paymentBreakdown: isAdmin && responses.length > 3 ? responses[4].data : [],
        outstandingBalances: isAdmin && responses.length > 3 ? responses[5].data : null,
        monthGrowth: isAdmin && responses.length > 3 ? responses[6].data : null,
        branchPerformance: [],
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [token, dashboardPeriod, isAdmin]);

  // Branch performance is fetched on its own so a failure never blocks the
  // dashboard, and it stays hidden until a second branch is actually created.
  useEffect(() => {
    if (!token || !isAdmin) return;
    axios
      .get(`${API_BASE_URL}/branches/performance`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const branches = res.data.multi_branch ? res.data.branches || [] : [];
        setBranchPerformance(branches);
        const cached = readDashboardCache(dashboardPeriod, isAdmin);
        if (cached) {
          writeDashboardCache(dashboardPeriod, isAdmin, {
            ...cached,
            branchPerformance: branches,
          });
        }
      })
      .catch(() => setBranchPerformance([]));
  }, [token, isAdmin, dashboardPeriod]);

  // Initial data fetch and refresh on changes
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Auto-refresh dashboard when page becomes visible (handles cancelled orders showing)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Refresh data when user returns to this tab/page
        fetchDashboardData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchDashboardData]);

  return (
    <MainLayout 
      title={isCashier ? `Welcome, ${user?.full_name || 'Cashier'}` : "Dashboard"} 
      subtitle={isCashier ? "Your work overview for today" : "Welcome back! Here's what's happening today."}
    >
      {/* Period Selector for Stats */}
      <div className="mb-6 flex items-center gap-4">
        <span className="text-sm font-medium text-muted-foreground">Show stats for:</span>
        {isCashier ? (
          <div className="rounded-full border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground">
            Today only
          </div>
        ) : (
          <Select value={statsPeriod} onValueChange={(value) => setStatsPeriod(value as 'today' | 'week' | 'month' | 'year' | 'all')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title={statsPeriod === 'today' ? "Today's Orders" : 
                 statsPeriod === 'week' ? "Week's Orders" :
                 statsPeriod === 'month' ? "Month's Orders" :
                 statsPeriod === 'year' ? "Year's Orders" : "Total Orders"}
          value={loading ? '...' : stats.totalOrders}
          subtitle={`${stats.pendingOrders + stats.processingOrders + stats.readyOrders} in progress`}
          icon={ShoppingCart}
          variant="primary"
        />
        
        {/* ADMIN ONLY: Revenue (sensitive financial data) */}
        {isAdmin ? (
          <StatCard
            title={statsPeriod === 'today' ? "Today's Revenue" : 
                   statsPeriod === 'week' ? "Week's Revenue" :
                   statsPeriod === 'month' ? "Month's Revenue" :
                   statsPeriod === 'year' ? "Year's Revenue" : "Total Revenue"}
            value={loading ? '...' : formatUGX(stats.totalRevenue)}
            subtitle="Cash collected"
            icon={DollarSign}
            variant="secondary"
          />
        ) : (
          <StatCard
            title="Orders Ready"
            value={loading ? '...' : stats.readyOrders}
            subtitle="Ready for pickup"
            icon={CheckCircle2}
            variant="secondary"
          />
        )}
        
        <StatCard
          title="Active Customers"
          value={loading ? '...' : stats.activeCustomers}
          subtitle="Total registered"
          icon={Users}
          variant="accent"
        />
        
        {/* Desktop/Manager see Payments count, Admin sees Avg Order Value */}
        {!isAdmin ? (
          <StatCard
            title={statsPeriod === 'today' ? "Today's Payments" :
                   statsPeriod === 'week' ? "Week's Payments" :
                   statsPeriod === 'month' ? "Month's Payments" :
                   statsPeriod === 'year' ? "Year's Payments" : "Total Payments"}
            value={loading ? '...' : stats.totalPayments}
            subtitle="Transactions received"
            icon={Receipt}
            variant="default"
          />
        ) : (
          <StatCard
            title="Avg Order Value"
            value={loading ? '...' : formatUGX(stats.averageOrderValue)}
            subtitle={statsPeriod === 'all' ? "All time" : "For selected period"}
            icon={TrendingUp}
            variant="default"
          />
        )}
      </div>

      {/* Branch performance — only rendered once a second branch exists */}
      {isAdmin && branchPerformance.length > 1 && (
        <div className="mb-8 rounded-xl border border-border bg-card p-4 sm:p-6">
          <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
            <Building2 className="h-5 w-5 text-primary" />
            Branch Performance
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {branchPerformance.map((branch) => (
              <div
                key={branch.branch_id}
                className="rounded-lg border border-border bg-background p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight break-words">{branch.branch_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{branch.branch_code}</p>
                  </div>
                  {!branch.is_active && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                      Inactive
                    </span>
                  )}
                </div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground shrink-0">Orders</dt>
                    <dd className="font-medium text-right">{branch.total_orders}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground shrink-0">Billed</dt>
                    <dd className="font-medium text-right">{formatUGX(branch.total_billed)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground shrink-0">Collected</dt>
                    <dd className="font-medium text-right text-green-600">
                      {formatUGX(branch.total_collected)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground shrink-0">Outstanding</dt>
                    <dd
                      className={
                        branch.outstanding > 0
                          ? 'font-medium text-right text-yellow-600'
                          : 'font-medium text-right'
                      }
                    >
                      {formatUGX(branch.outstanding)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground shrink-0">Avg order</dt>
                    <dd className="font-medium text-right">
                      {formatUGX(branch.average_order_value)}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enhanced Financial Summary - ADMIN ONLY */}
      {isAdmin && (
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Financial Overview */}
          <div className="lg:col-span-2 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 rounded-xl border border-green-200 dark:border-green-800 p-6">
              <div className="mb-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  Financial Performance
                </h3>
              </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold text-green-600">
                  {loading ? '...' : formatUGX(financialSummary?.revenue || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {loading ? '...' : `${financialSummary?.orderCount || 0} payments`}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Operating Expenses</p>
                <p className="text-2xl font-bold text-red-600">
                  {loading ? '...' : formatUGX(financialSummary?.expenses || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Staff-recorded costs</p>
              </div>
              {/* Payroll line — only visible to admins */}
              {isAdmin && (financialSummary?.salaries ?? 0) > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">Payroll</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {loading ? '...' : formatUGX(financialSummary?.salaries || 0)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Salary payments</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className={`text-2xl font-bold ${(financialSummary?.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {loading ? '...' : formatUGX(financialSummary?.profit || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {loading ? '...' : `${(financialSummary?.profitMargin || 0).toFixed(1)}% margin`}
                  {isAdmin && (financialSummary?.salaries ?? 0) > 0 && (
                    <span className="block text-[10px] opacity-60">after expenses + payroll</span>
                  )}
                </p>
              </div>
            </div>
            
            {monthGrowth && (
              <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
                <p className="text-sm font-medium mb-2">Month-over-Month Growth</p>
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className={`text-lg font-semibold ${monthGrowth.growth.revenue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {monthGrowth.growth.revenue >= 0 ? '+' : ''}{monthGrowth.growth.revenue.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Orders</p>
                    <p className={`text-lg font-semibold ${monthGrowth.growth.orders >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {monthGrowth.growth.orders >= 0 ? '+' : ''}{monthGrowth.growth.orders.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Outstanding Balances */}
          {outstandingBalances && (
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950 dark:to-amber-950 rounded-xl border border-orange-200 dark:border-orange-800 p-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  Outstanding Balances
                </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">Unpaid Orders</p>
                    <p className="text-xs text-muted-foreground">{outstandingBalances.unpaid.count} orders</p>
                  </div>
                  <p className="text-lg font-bold text-red-600">{formatUGX(outstandingBalances.unpaid.total)}</p>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">Partial Payments</p>
                    <p className="text-xs text-muted-foreground">{outstandingBalances.partial.count} orders</p>
                  </div>
                  <p className="text-lg font-bold text-orange-600">{formatUGX(outstandingBalances.partial.total)}</p>
                </div>
                <div className="pt-3 border-t border-orange-200 dark:border-orange-800">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-red-600">Overdue (30+ days)</p>
                      <p className="text-xs text-muted-foreground">{outstandingBalances.overdue.count} orders</p>
                    </div>
                    <p className="text-lg font-bold text-red-600">{formatUGX(outstandingBalances.overdue.total)}</p>
                  </div>
                </div>
              </div>
              <Link to="/orders?payment=UNPAID">
                <Button className="w-full mt-4" variant="outline" size="sm">
                  View Unpaid Orders
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Payment Methods Breakdown - ADMIN ONLY (Pie Chart) */}
      {isAdmin && (() => {
        if (loading) {
          return (
            <div className="mb-8 bg-card rounded-xl border border-border p-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-blue-600" />
                Payment Methods Distribution
              </h3>
              <div className="text-center text-muted-foreground py-12">Loading...</div>
            </div>
          );
        }
        
        if (!paymentBreakdown || paymentBreakdown.length === 0) {
          return (
            <div className="mb-8 bg-card rounded-xl border border-border p-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-blue-600" />
                Payment Methods Distribution ({statsPeriod === 'today' ? 'Today' : statsPeriod === 'week' ? 'This Week' : statsPeriod === 'month' ? 'This Month' : statsPeriod === 'year' ? 'This Year' : 'All Time'})
              </h3>
              <div className="text-center text-muted-foreground py-12">No payment data for this period</div>
            </div>
          );
        }
        
        // Ensure all values are numbers
        const total = paymentBreakdown.reduce((sum, m) => sum + Number(m.total_amount || 0), 0);
        
        const COLORS = {
          'Mobile Money (MTN)': '#FCD34D',
          'Mobile Money (Airtel)': '#EF4444',
          'Cash': '#10B981',
          'Bank Transfer': '#3B82F6',
        };
        
        const chartData = paymentBreakdown.map(method => {
          const amount = Number(method.total_amount || 0);
          const percentage = total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0';
          return {
            name: method.method,
            value: amount,
            percentage: percentage,
            transactions: method.transaction_count,
            color: COLORS[method.method as keyof typeof COLORS] || '#6B7280'
          };
        });

        return (
          <div className="mb-8 bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-600" />
              Payment Methods Distribution ({statsPeriod === 'today' ? 'Today' : statsPeriod === 'week' ? 'This Week' : statsPeriod === 'month' ? 'This Month' : statsPeriod === 'year' ? 'This Year' : 'All Time'})
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart */}
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.percentage}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatUGX(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              {/* Summary Stats */}
              <div className="space-y-3">
                {chartData.map((method, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: method.color }}></div>
                      <div>
                        <p className="text-sm font-medium">{method.name}</p>
                        <p className="text-xs text-muted-foreground">{method.transactions} transactions</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{method.percentage}%</p>
                      <p className="text-xs text-muted-foreground">{formatUGX(Number(method.value))}</p>
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t border-border">
                  <div className="flex justify-between">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-lg">{formatUGX(total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border shadow-sm">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Recent Orders</h2>
              <p className="text-sm text-muted-foreground">Latest order activity</p>
            </div>
            <Link to="/orders">
              <Button variant="outline" size="sm" className="gap-2">
                View All
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading orders...</div>
            ) : recentOrders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No orders today</div>
            ) : (
              recentOrders.map((order) => (
                <Link 
                  key={order.id} 
                  to="/orders" 
                  state={{ searchOrderNumber: order.order_number }}
                  className="block"
                >
                  <div className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary font-semibold text-sm">
                            {order.customer_name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground truncate">{order.customer_name}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {order.order_number} • {order.item_count} items
                          </p>
                        </div>
                      </div>
                      <div className="text-left sm:text-right shrink-0 w-full sm:w-auto">
                        <p className="font-semibold text-foreground">{formatUGX(order.total_amount)}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">{formatOrderDate(order.created_at)}</span>
                          <OrderStatusBadge status={order.order_status} />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions & Status */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link to="/orders/new" className="block">
                <Button className="w-full justify-start gap-3 h-12 bg-secondary hover:bg-secondary/90 text-secondary-foreground">
                  <ShoppingCart className="h-5 w-5" />
                  {isCashier ? 'Create New Order' : 'New Order'}
                </Button>
              </Link>
              <Link to="/customers" className="block">
                <Button variant="outline" className="w-full justify-start gap-3 h-12">
                  <Users className="h-5 w-5" />
                  {isCashier ? 'Register Customer' : 'Add Customer'}
                </Button>
              </Link>
              <Link to="/prices" className="block">
                <Button variant="outline" className="w-full justify-start gap-3 h-12">
                  <DollarSign className="h-5 w-5" />
                  View Prices
                </Button>
              </Link>
              {isCashier && (
                <Link to="/expenses" className="block">
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <Receipt className="h-5 w-5" />
                    Record Expense
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Order Status Overview */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h2 className="text-lg font-semibold text-foreground mb-1">Order Status</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Current workflow • Delivered: {statsPeriod === 'today' ? 'Today' :
                  statsPeriod === 'week' ? 'This Week' :
                  statsPeriod === 'month' ? 'This Month' :
                  statsPeriod === 'year' ? 'This Year' : 'All Time'}
              </p>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  <span className="text-muted-foreground">Pending</span>
                </div>
                <span className="text-xl font-bold text-foreground">{stats.pendingOrders}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600" />
                  <span className="text-muted-foreground">Processing</span>
                </div>
                <span className="text-xl font-bold text-foreground">{stats.processingOrders}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-muted-foreground">Ready</span>
                </div>
                <span className="text-xl font-bold text-foreground">{stats.readyOrders}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="text-muted-foreground">
                    Delivered {statsPeriod === 'all' ? '' : `(${statsPeriod === 'today' ? 'today' :
                      statsPeriod === 'week' ? 'this week' :
                      statsPeriod === 'month' ? 'this month' : 'this year'})`}
                  </span>
                </div>
                <span className="text-xl font-bold text-foreground">{stats.deliveredOrders}</span>
              </div>
              {stats.cancelledOrders > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <span className="text-muted-foreground">Cancelled</span>
                  </div>
                  <span className="text-xl font-bold text-foreground">{stats.cancelledOrders}</span>
                </div>
              )}
            </div>
          </div>

          {/* Business Hours */}
          <div className="bg-gradient-brand rounded-xl p-6 text-primary-foreground">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="font-semibold">Business Hours</h3>
              {openStatus && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    openStatus.isOpen
                      ? 'bg-white/25 text-white'
                      : 'bg-black/25 text-white'
                  }`}
                >
                  {openStatus.isOpen ? 'Open now' : 'Closed now'}
                </span>
              )}
            </div>
            {businessHours ? (
              <div className="space-y-1 text-sm opacity-90">
                {(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const).map((day) => {
                  const hours = businessHours[day];
                  const isToday = day === TODAY_KEY;
                  return (
                    <p key={day} className={isToday ? 'font-semibold opacity-100' : undefined}>
                      <span className="capitalize">{day}</span>:{' '}
                      {hours.closed
                        ? 'Closed'
                        : `${formatBusinessTime(hours.open)} - ${formatBusinessTime(hours.close)}`}
                    </p>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1 text-sm opacity-90">
                <p>Loading hours...</p>
              </div>
            )}
            <p className="mt-3 text-xs opacity-70 italic">
              "Elegance Begins With Clean"
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

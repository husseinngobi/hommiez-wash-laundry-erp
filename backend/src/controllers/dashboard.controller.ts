import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { resolveListBranchId, andBranchFilter, paymentsFrom } from '../utils/branchScope';

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'today', branch_id } = req.query; // 'today', 'week', 'month', 'year', 'all'
    const branchId = resolveListBranchId(req, branch_id);

    // Build date filters based on period (using timezone-aware dates)
    // Use 'Africa/Nairobi' timezone (EAT = UTC+3) for local business time
    let ordersDateFilter = '';
    let paymentsDateFilter = '';
    let deliveriesDateFilter = '';
    let updatedAtDateFilter = ''; // For tracking when orders were delivered/cancelled

    switch (period) {
      case 'today':
        ordersDateFilter = "WHERE DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE(NOW() AT TIME ZONE 'Africa/Nairobi')";
        paymentsDateFilter = "WHERE DATE(payment_date AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE(NOW() AT TIME ZONE 'Africa/Nairobi')";
        deliveriesDateFilter = "WHERE DATE(delivered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE(NOW() AT TIME ZONE 'Africa/Nairobi')";
        updatedAtDateFilter = "WHERE DATE(updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE(NOW() AT TIME ZONE 'Africa/Nairobi')";
        break;
      case 'week':
        ordersDateFilter = "WHERE created_at >= NOW() AT TIME ZONE 'Africa/Nairobi' - INTERVAL '7 days'";
        paymentsDateFilter = "WHERE payment_date >= NOW() AT TIME ZONE 'Africa/Nairobi' - INTERVAL '7 days'";
        deliveriesDateFilter = "WHERE delivered_at >= NOW() AT TIME ZONE 'Africa/Nairobi' - INTERVAL '7 days'";
        updatedAtDateFilter = "WHERE updated_at >= NOW() AT TIME ZONE 'Africa/Nairobi' - INTERVAL '7 days'";
        break;
      case 'month':
        ordersDateFilter = "WHERE DATE_TRUNC('month', created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Africa/Nairobi')";
        paymentsDateFilter = "WHERE DATE_TRUNC('month', payment_date AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Africa/Nairobi')";
        deliveriesDateFilter = "WHERE DATE_TRUNC('month', delivered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Africa/Nairobi')";
        updatedAtDateFilter = "WHERE DATE_TRUNC('month', updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Africa/Nairobi')";
        break;
      case 'year':
        ordersDateFilter = "WHERE DATE_TRUNC('year', created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE_TRUNC('year', NOW() AT TIME ZONE 'Africa/Nairobi')";
        paymentsDateFilter = "WHERE DATE_TRUNC('year', payment_date AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE_TRUNC('year', NOW() AT TIME ZONE 'Africa/Nairobi')";
        deliveriesDateFilter = "WHERE DATE_TRUNC('year', delivered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE_TRUNC('year', NOW() AT TIME ZONE 'Africa/Nairobi')";
        updatedAtDateFilter = "WHERE DATE_TRUNC('year', updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE_TRUNC('year', NOW() AT TIME ZONE 'Africa/Nairobi')";
        break;
      case 'all':
      default:
        ordersDateFilter = "";
        paymentsDateFilter = "";
        deliveriesDateFilter = "";
        updatedAtDateFilter = "";
        break;
    }

    ordersDateFilter = andBranchFilter(ordersDateFilter, 'branch_id', branchId);
    updatedAtDateFilter = andBranchFilter(updatedAtDateFilter, 'branch_id', branchId);
    const payFrom = paymentsFrom(branchId);
    const branchOrderAnd = branchId ? `AND branch_id = ${Number(branchId)}` : '';

    // Orders count for selected period
    const ordersResult = await query(
      `SELECT COUNT(*) as count FROM orders ${ordersDateFilter}`
    );

    // Revenue for selected period (from PAYMENTS, not orders)
    const revenueResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as order_revenue
       ${payFrom} ${paymentsDateFilter}`
    );

    // Delivery revenue for selected period. Deliveries are a side ledger, so a
    // problem here must not blank the whole dashboard — fall back to zero.
    let deliveryRevenue = 0;
    try {
      const deliveryRevenueResult = await query(
        `SELECT COALESCE(SUM(delivery_revenue), 0) as delivery_revenue
         FROM deliveries 
         ${deliveriesDateFilter}
         ${deliveriesDateFilter ? 'AND' : 'WHERE'} delivery_type = 'PAID'
         AND delivery_status = 'DELIVERED'
         AND payment_status = 'PAID'
         ${branchId ? `AND order_id IN (SELECT id FROM orders WHERE branch_id = ${Number(branchId)})` : ''}`
      );
      deliveryRevenue = parseFloat(deliveryRevenueResult.rows[0].delivery_revenue) || 0;
    } catch (deliveryError) {
      console.error('⚠️ Delivery revenue unavailable, counting it as 0:', deliveryError);
    }

    const totalRevenue =
      parseFloat(revenueResult.rows[0].order_revenue) + deliveryRevenue;

    // Total active customers (always all-time)
    const activeCustomersResult = await query(
      `SELECT COUNT(*) as count FROM customers`
    );

    // Average order value (for selected period)
    const avgOrderValueResult = await query(
      `SELECT COALESCE(AVG(total_amount), 0) as avg_value FROM orders ${ordersDateFilter}`
    );

    // Order status counts:
    // PENDING, PROCESSING, READY - Always show current state (all orders in that status NOW)
    // DELIVERED - Filter by period (orders delivered in selected timeframe) - use updated_at
    // CANCELLED - Filter by period (orders cancelled in selected timeframe) - use updated_at
    
    const pendingOrdersResult = await query(
      `SELECT COUNT(*) as count FROM orders WHERE status = 'pending' ${branchOrderAnd}`
    );

    const processingOrdersResult = await query(
      `SELECT COUNT(*) as count FROM orders WHERE status = 'processing' ${branchOrderAnd}`
    );

    const readyOrdersResult = await query(
      `SELECT COUNT(*) as count FROM orders WHERE status = 'ready' ${branchOrderAnd}`
    );

    // DELIVERED - filtered by period (when they were marked delivered via updated_at)
    const deliveredOrdersResult = await query(
      `SELECT COUNT(*) as count FROM orders 
       ${updatedAtDateFilter}
       ${updatedAtDateFilter ? 'AND' : 'WHERE'} status = 'delivered'`
    );

    // CANCELLED - filtered by period (when they were marked cancelled via updated_at)
    const cancelledOrdersResult = await query(
      `SELECT COUNT(*) as count FROM orders 
       ${updatedAtDateFilter}
       ${updatedAtDateFilter ? 'AND' : 'WHERE'} status = 'cancelled'`
    );

    // Payment transactions count for selected period
    const paymentsResult = await query(
      `SELECT COUNT(*) as count ${payFrom} ${paymentsDateFilter}`
    );

    // Pending users count (always current, for admin notification badge)
    const pendingUsersResult = await query(
      `SELECT COUNT(*) as count FROM users 
       WHERE status = 'PENDING'`
    );

    res.json({
      period: period,
      totalOrders: parseInt(ordersResult.rows[0].count),
      totalRevenue: totalRevenue,
      activeCustomers: parseInt(activeCustomersResult.rows[0].count),
      averageOrderValue: parseFloat(avgOrderValueResult.rows[0].avg_value),
      pendingOrders: parseInt(pendingOrdersResult.rows[0].count),
      processingOrders: parseInt(processingOrdersResult.rows[0].count),
      readyOrders: parseInt(readyOrdersResult.rows[0].count),
      deliveredOrders: parseInt(deliveredOrdersResult.rows[0].count),
      cancelledOrders: parseInt(cancelledOrdersResult.rows[0].count),
      totalPayments: parseInt(paymentsResult.rows[0].count),
      pendingUsers: parseInt(pendingUsersResult.rows[0].count), // NEW: for notifications
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
};

/**
 * Get comprehensive financial summary with revenue, expenses, profit
 */
/** Build a [startDate, endDate] pair for a human period label, or null for all-time. */
function periodToDateRange(period: unknown): [Date, Date] | null {
  const endDate = new Date();
  const startDate = new Date();

  switch (String(period)) {
    case 'today':
    case 'day':
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'week':
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'month':
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setMonth(endDate.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'year':
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setMonth(11, 31);
      endDate.setHours(23, 59, 59, 999);
      break;
    default:
      // 'all' or unknown — no date restriction
      return null;
  }

  return [startDate, endDate];
}

export const getFinancialSummary = async (req: AuthRequest, res: Response) => {
  try {
    const period = req.query.period || 'month';
    const branchId = resolveListBranchId(req, req.query.branch_id);
    const dateRange = periodToDateRange(period);
    const payFrom = paymentsFrom(branchId);
    const branchExp = branchId ? `AND branch_id = ${Number(branchId)}` : '';
    const branchOrd = branchId ? `AND branch_id = ${Number(branchId)}` : '';
    const salaryBranch = branchId
      ? `AND employee_id IN (SELECT id FROM payroll_employees WHERE branch_id = ${Number(branchId)})`
      : '';

    // When dateRange is null we query all-time (no WHERE clause on date).
    const paymentsWhere = dateRange
      ? `WHERE payment_date >= $1 AND payment_date <= $2`
      : `WHERE TRUE`;
    const deliveriesWhere = dateRange
      ? `WHERE delivered_at >= $1 AND delivered_at <= $2`
      : `WHERE TRUE`;
    const expensesWhere = dateRange
      ? `WHERE expense_date >= $1 AND expense_date <= $2 AND COALESCE(status, approval_status) = 'APPROVED'`
      : `WHERE COALESCE(status, approval_status) = 'APPROVED'`;
    const params = dateRange ? dateRange : [];

    const revenueResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_revenue,
              COUNT(*) as payment_count
       ${payFrom} ${paymentsWhere}`,
      params
    );

    let deliveryRevenue = 0;
    let deliveryCount = 0;
    try {
      const drResult = await query(
        `SELECT COALESCE(SUM(delivery_revenue), 0) as delivery_revenue,
                COUNT(*) as delivery_count
         FROM deliveries ${deliveriesWhere}
         AND delivery_type = 'PAID'
         AND delivery_status = 'DELIVERED'`,
        params
      );
      deliveryRevenue = parseFloat(drResult.rows[0].delivery_revenue) || 0;
      deliveryCount   = parseInt(drResult.rows[0].delivery_count) || 0;
    } catch {
      // delivery_revenue column may not exist yet; safe to skip
    }

    const expensesResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_expenses
       FROM expenses ${expensesWhere} ${branchExp}`,
      params
    );

    // Include salary payments in total expenses so dashboard profit is accurate
    const salaryParams = params; // same date params apply
    const salaryWhere = expensesWhere.replace('expense_date', 'payment_date').replace('COALESCE(status, approval_status)', 'payment_status').replace("'APPROVED'", "'PAID'");
    let salaries = 0;
    try {
      const salaryResult = await query(
        `SELECT COALESCE(SUM(net_amount), 0) as total_salaries FROM salary_payments ${salaryWhere} ${salaryBranch}`,
        salaryParams
      );
      salaries = parseFloat(salaryResult.rows[0].total_salaries) || 0;
    } catch { /* salary_payments table may not exist in older environments */ }

    const outstandingResult = await query(
      `SELECT COALESCE(SUM(
         GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))
       ), 0) as outstanding_balance
       FROM orders
       WHERE payment_status IN ('UNPAID', 'PARTIAL') ${branchOrd}`
    );

    const orderRevenue = parseFloat(revenueResult.rows[0].total_revenue) || 0;
    const revenue      = orderRevenue + deliveryRevenue;
    // Keep operational expenses and payroll separate so staff can see their own
    // expense entries without salary figures leaking to non-admin views.
    const expenses     = parseFloat(expensesResult.rows[0].total_expenses) || 0;
    // Net profit deducts both operational expenses AND payroll salaries
    const profit       = revenue - expenses - salaries;
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

    res.json({
      revenue,
      deliveryRevenue,
      orderRevenue,
      expenses,       // operational expenses only (staff-visible)
      salaries,       // payroll total (admin-only in UI)
      profit,         // revenue − expenses − salaries
      profitMargin,
      outstandingBalance: parseFloat(outstandingResult.rows[0].outstanding_balance) || 0,
      orderCount: parseInt(revenueResult.rows[0].payment_count) || 0,
      deliveryCount,
    });
  } catch (error) {
    console.error('Get financial summary error:', error);
    res.status(500).json({ error: 'Failed to fetch financial summary' });
  }
};

/**
 * Get payment methods breakdown (Cash, Mobile Money, Bank Transfer)
 */
export const getPaymentMethodsBreakdown = async (req: AuthRequest, res: Response) => {
  try {
    const period = req.query.period || 'month';
    const branchId = resolveListBranchId(req, req.query.branch_id);
    const dateRange = periodToDateRange(period);
    const payFrom = paymentsFrom(branchId);

    const whereClause = dateRange
      ? `WHERE payment_date >= $1 AND payment_date <= $2`
      : `WHERE TRUE`;
    const params = dateRange ? dateRange : [];

    const breakdownResult = await query(
      `SELECT
        CASE
          WHEN payment_method IN ('MOBILE_MONEY_MTN', 'MTN Mobile Money') THEN 'Mobile Money (MTN)'
          WHEN payment_method IN ('MOBILE_MONEY_AIRTEL', 'Airtel Money')  THEN 'Mobile Money (Airtel)'
          WHEN payment_method = 'BANK_TRANSFER'  THEN 'Bank Transfer'
          WHEN payment_method = 'ON_ACCOUNT'     THEN 'On Account'
          WHEN payment_method = 'CASH'           THEN 'Cash'
          ELSE COALESCE(NULLIF(TRIM(payment_method), ''), 'Other')
        END as method,
        COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) as total_amount
       ${payFrom}
       ${whereClause}
       GROUP BY method
       ORDER BY total_amount DESC`,
      params
    );

    res.json(breakdownResult.rows);
  } catch (error) {
    console.error('Get payment methods breakdown error:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods breakdown' });
  }
};

/**
 * Get outstanding balances summary
 */
export const getOutstandingBalances = async (req: AuthRequest, res: Response) => {
  try {
    const branchId = resolveListBranchId(req, req.query.branch_id);
    const branchOrd = branchId ? `AND branch_id = ${Number(branchId)}` : '';
    const outstandingExpr = `GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))`;

    // Get unpaid orders
    const unpaidResult = await query(
      `SELECT 
        COUNT(*) as count,
        COALESCE(SUM(${outstandingExpr}), 0) as total
       FROM orders 
       WHERE payment_status = 'UNPAID' ${branchOrd}`
    );

    // Get partial payments
    const partialResult = await query(
      `SELECT 
        COUNT(*) as count,
        COALESCE(SUM(${outstandingExpr}), 0) as total
       FROM orders 
       WHERE payment_status = 'PARTIAL' ${branchOrd}`
    );

    // Get overdue orders (>30 days old with balance)
    const overdueResult = await query(
      `SELECT 
        COUNT(*) as count,
        COALESCE(SUM(${outstandingExpr}), 0) as total
       FROM orders 
       WHERE payment_status IN ('UNPAID', 'PARTIAL')
       AND created_at < NOW() - INTERVAL '30 days' ${branchOrd}`
    );

    res.json({
      unpaid: {
        count: parseInt(unpaidResult.rows[0].count),
        total: parseFloat(unpaidResult.rows[0].total),
      },
      partial: {
        count: parseInt(partialResult.rows[0].count),
        total: parseFloat(partialResult.rows[0].total),
      },
      overdue: {
        count: parseInt(overdueResult.rows[0].count),
        total: parseFloat(overdueResult.rows[0].total),
      },
    });
  } catch (error) {
    console.error('Get outstanding balances error:', error);
    res.status(500).json({ error: 'Failed to fetch outstanding balances' });
  }
};

/**
 * Get daily collections summary (for end-of-day reconciliation)
 */
export const getDailyCollections = async (req: AuthRequest, res: Response) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    date.setHours(0, 0, 0, 0);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all payments for the day
    const paymentsResult = await query(
      `SELECT 
        p.payment_method,
        COUNT(*) as transaction_count,
        COALESCE(SUM(p.amount), 0) as total_amount,
        u.full_name as collected_by
       FROM payments p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.payment_date >= $1 AND p.payment_date < $2
       GROUP BY p.payment_method, u.full_name
       ORDER BY total_amount DESC`,
      [date, nextDay]
    );

    // Get daily summary
    const summaryResult = await query(
      `SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(amount), 0) as total_collected
       FROM payments
       WHERE payment_date >= $1 AND payment_date < $2`,
      [date, nextDay]
    );

    res.json({
      date: date.toISOString().split('T')[0],
      summary: {
        totalTransactions: parseInt(summaryResult.rows[0].total_transactions),
        totalCollected: parseFloat(summaryResult.rows[0].total_collected),
      },
      breakdown: paymentsResult.rows.map(row => ({
        method: row.payment_method,
        transactionCount: parseInt(row.transaction_count),
        totalAmount: parseFloat(row.total_amount),
        collectedBy: row.collected_by || 'Unknown',
      })),
    });
  } catch (error) {
    console.error('Get daily collections error:', error);
    res.status(500).json({ error: 'Failed to fetch daily collections' });
  }
};

/**
 * Get month-over-month growth comparison
 */
export const getMonthOverMonth = async (req: AuthRequest, res: Response) => {
  try {
    const branchId = resolveListBranchId(req, req.query.branch_id);
    const branchOrd = branchId ? `AND branch_id = ${Number(branchId)}` : '';
    // Current month
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);
    const currentMonthEnd = new Date();

    // Previous month
    const previousMonthStart = new Date(currentMonthStart);
    previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);
    const previousMonthEnd = new Date(currentMonthStart);
    previousMonthEnd.setDate(0); // Last day of previous month
    previousMonthEnd.setHours(23, 59, 59, 999);

    // Current month stats
    const currentResult = await query(
      `SELECT 
        COUNT(*) as order_count,
        COALESCE(SUM(amount_paid), 0) as revenue
       FROM orders 
       WHERE created_at >= $1 AND created_at <= $2 ${branchOrd}`,
      [currentMonthStart, currentMonthEnd]
    );

    // Previous month stats
    const previousResult = await query(
      `SELECT 
        COUNT(*) as order_count,
        COALESCE(SUM(amount_paid), 0) as revenue
       FROM orders 
       WHERE created_at >= $1 AND created_at <= $2 ${branchOrd}`,
      [previousMonthStart, previousMonthEnd]
    );

    const currentRevenue = parseFloat(currentResult.rows[0].revenue);
    const previousRevenue = parseFloat(previousResult.rows[0].revenue);
    const currentOrders = parseInt(currentResult.rows[0].order_count);
    const previousOrders = parseInt(previousResult.rows[0].order_count);

    const revenueGrowth = previousRevenue > 0 
      ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 
      : 0;
    
    const ordersGrowth = previousOrders > 0
      ? ((currentOrders - previousOrders) / previousOrders) * 100
      : 0;

    res.json({
      currentMonth: {
        revenue: currentRevenue,
        orders: currentOrders,
      },
      previousMonth: {
        revenue: previousRevenue,
        orders: previousOrders,
      },
      growth: {
        revenue: revenueGrowth,
        orders: ordersGrowth,
      },
    });
  } catch (error) {
    console.error('Get month-over-month error:', error);
    res.status(500).json({ error: 'Failed to fetch month-over-month comparison' });
  }
};

/**
 * Get recent orders - orders that have been "touched" recently
 * Shows the most recent orders by activity (created, updated, or received payments)
 * Not limited to today - shows latest activity from any time period
 */
export const getRecentOrders = async (req: AuthRequest, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const userRole = req.user?.role;

    // Get orders sorted by most recent activity
    // Activity includes: creation, updates, payments
    // BUSINESS RULE: Only ADMIN can see cancelled orders
    const branchId = resolveListBranchId(req, req.query.branch_id);
    const branchOrd = branchId ? `AND o.branch_id = ${Number(branchId)}` : '';
    const cancelledFilter = userRole !== 'ADMIN' ? `AND o.status != 'cancelled'` : '';
    
    const sql = `
      SELECT 
        o.id, 
        o.order_number, 
        o.customer_id,
        o.status as order_status,
        o.payment_status,
        o.total_amount,
        o.created_at,
        o.updated_at,
        c.name as customer_name,
        c.phone as customer_phone,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count,
        GREATEST(
          o.created_at,
          o.updated_at,
          COALESCE((
            SELECT MAX(p.payment_date) 
            FROM payments p 
            WHERE p.order_id = o.id
          ), o.created_at)
        ) as last_activity
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE 1=1 ${cancelledFilter} ${branchOrd}
      ORDER BY last_activity DESC
      LIMIT $1
    `;

    const result = await query(sql, [limit]);

    res.json({ orders: result.rows });
  } catch (error) {
    console.error('Get recent orders error:', error);
    res.status(500).json({ error: 'Failed to fetch recent orders' });
  }
};

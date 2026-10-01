import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { resolveListBranchId, andBranchFilter, paymentsFrom } from '../utils/branchScope';

/**
 * Get comprehensive financial dashboard data
 */
export const getFinancialDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'all', from_date, to_date, branch_id } = req.query;
    const branchId = resolveListBranchId(req, branch_id);

    let dateFilter = '';
    let paymentsDateFilter = '';
    let ordersDateFilter = '';
    let expensesDateFilter = '';
    let trendDays = 30;

    const hasCustomRange = period === 'custom' && typeof from_date === 'string' && typeof to_date === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(from_date)
      && /^\d{4}-\d{2}-\d{2}$/.test(to_date)
      && from_date <= to_date;

    // Check if period is a specific year (e.g., '2021', '2022', '2023')
    if (hasCustomRange) {
      dateFilter = `WHERE summary_date >= DATE '${from_date}' AND summary_date < DATE '${to_date}' + INTERVAL '1 day'`;
      paymentsDateFilter = `WHERE payment_date >= DATE '${from_date}' AND payment_date < DATE '${to_date}' + INTERVAL '1 day'`;
      ordersDateFilter = `WHERE created_at >= DATE '${from_date}' AND created_at < DATE '${to_date}' + INTERVAL '1 day'`;
      expensesDateFilter = `WHERE expense_date >= DATE '${from_date}' AND expense_date < DATE '${to_date}' + INTERVAL '1 day'`;
      trendDays = 0;
    } else if (period === 'custom') {
      return res.status(400).json({ error: 'Valid from_date and to_date are required for a custom range' });
    } else if (period && /^\d{4}$/.test(period as string)) {
      const year = period as string;
      dateFilter = `WHERE DATE_TRUNC('year', summary_date) = DATE_TRUNC('year', DATE '${year}-01-01')`;
      paymentsDateFilter = `WHERE DATE_TRUNC('year', payment_date) = DATE_TRUNC('year', DATE '${year}-01-01')`;
      ordersDateFilter = `WHERE DATE_TRUNC('year', created_at) = DATE_TRUNC('year', DATE '${year}-01-01')`;
      expensesDateFilter = `WHERE DATE_TRUNC('year', expense_date) = DATE_TRUNC('year', DATE '${year}-01-01')`;
      trendDays = 365;
    } else {
      switch (period) {
        case 'all':
          dateFilter = '';
          paymentsDateFilter = '';
          ordersDateFilter = '';
          expensesDateFilter = '';
          trendDays = 0;
          break;
        case 'today':
          dateFilter = "WHERE summary_date = CURRENT_DATE";
          paymentsDateFilter = "WHERE DATE(payment_date) = CURRENT_DATE";
          ordersDateFilter = "WHERE DATE(created_at) = CURRENT_DATE";
          expensesDateFilter = "WHERE DATE(expense_date) = CURRENT_DATE";
          trendDays = 1;
          break;
        case 'week':
          dateFilter = "WHERE summary_date >= CURRENT_DATE - INTERVAL '7 days'";
          paymentsDateFilter = "WHERE payment_date >= CURRENT_DATE - INTERVAL '7 days'";
          ordersDateFilter = "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'";
          expensesDateFilter = "WHERE expense_date >= CURRENT_DATE - INTERVAL '7 days'";
          trendDays = 7;
          break;
        case 'month':
          dateFilter = "WHERE DATE_TRUNC('month', summary_date) = DATE_TRUNC('month', CURRENT_DATE)";
          paymentsDateFilter = "WHERE DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)";
          ordersDateFilter = "WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)";
          expensesDateFilter = "WHERE DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', CURRENT_DATE)";
          trendDays = 30;
          break;
        case 'year':
          dateFilter = "WHERE DATE_TRUNC('year', summary_date) = DATE_TRUNC('year', CURRENT_DATE)";
          paymentsDateFilter = "WHERE DATE_TRUNC('year', payment_date) = DATE_TRUNC('year', CURRENT_DATE)";
          ordersDateFilter = "WHERE DATE_TRUNC('year', created_at) = DATE_TRUNC('year', CURRENT_DATE)";
          expensesDateFilter = "WHERE DATE_TRUNC('year', expense_date) = DATE_TRUNC('year', CURRENT_DATE)";
          trendDays = 365;
          break;
        default:
          dateFilter = "WHERE DATE_TRUNC('month', summary_date) = DATE_TRUNC('month', CURRENT_DATE)";
          paymentsDateFilter = "WHERE DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)";
          ordersDateFilter = "WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)";
          expensesDateFilter = "WHERE DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', CURRENT_DATE)";
          trendDays = 30;
      }
    }

    ordersDateFilter = andBranchFilter(ordersDateFilter, 'branch_id', branchId);
    expensesDateFilter = andBranchFilter(expensesDateFilter, 'branch_id', branchId);
    const payFrom = paymentsFrom(branchId);

    // Overall summary - USE PAYMENTS TABLE (when money was actually received)
    const revenueResult = await query(
      `SELECT 
        COALESCE(SUM(amount), 0) as total_revenue,
        COUNT(DISTINCT order_id) as total_orders
       ${payFrom} 
       ${paymentsDateFilter}
       ${paymentsDateFilter ? 'AND' : 'WHERE'} COALESCE(is_cancelled, FALSE) = FALSE
       AND COALESCE(is_refund, FALSE) = FALSE`
    );

    const expensesResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_expenses,
              COUNT(*) as total_expense_records
       FROM expenses 
      ${expensesDateFilter ? `${expensesDateFilter} AND` : 'WHERE'} COALESCE(status, approval_status) = 'APPROVED'`
    );

    const salariesResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_salaries
       FROM expenses 
       ${expensesDateFilter ? `${expensesDateFilter} AND` : 'WHERE'} category = 'Salaries'
      AND COALESCE(status, approval_status) = 'APPROVED'`
    );

    const summaryData = {
      total_revenue: revenueResult.rows[0].total_revenue,
      total_orders: revenueResult.rows[0].total_orders,
      total_expenses: expensesResult.rows[0].total_expenses,
      total_expense_records: expensesResult.rows[0].total_expense_records,
      total_salaries: salariesResult.rows[0].total_salaries,
      net_profit: parseFloat(revenueResult.rows[0].total_revenue) - parseFloat(expensesResult.rows[0].total_expenses),
    };

    // Revenue by payment status
    const revenueBreakdownResult = await query(
      `SELECT 
        payment_status,
        COUNT(*) as count,
        COALESCE(SUM(COALESCE(total_amount, total, 0)), 0) as amount
       FROM orders 
       ${ordersDateFilter}
       GROUP BY payment_status`
    );

    // Top expense categories
    const topExpensesResult = await query(
      `SELECT 
        e.category as category,
        '#3B82F6' as color,
        COALESCE(SUM(e.amount), 0) as amount,
        COUNT(e.id) as count
       FROM expenses e
      ${expensesDateFilter ? `${expensesDateFilter} AND` : 'WHERE'} COALESCE(e.status, e.approval_status) = 'APPROVED'
       GROUP BY e.category
       HAVING COALESCE(SUM(e.amount), 0) > 0
       ORDER BY amount DESC
       LIMIT 5`
    );

    // Daily trend (dynamic based on period)
    // Build a custom WHERE clause with table alias to avoid ambiguity
    const trendDateFilter = ordersDateFilter.replace(/created_at/g, 'o.created_at');
    
    const trendResult = await query(
      `SELECT 
        DATE(o.created_at) as date,
        COALESCE(SUM(o.amount_paid), 0) as revenue,
        COALESCE(SUM(e.amount), 0) as expenses,
        0 as salaries,
        COALESCE(SUM(o.amount_paid), 0) - COALESCE(SUM(e.amount), 0) as profit
       FROM orders o
      LEFT JOIN expenses e ON DATE(e.expense_date) = DATE(o.created_at)
        AND COALESCE(e.status, e.approval_status) = 'APPROVED'
        ${branchId ? `AND e.branch_id = ${Number(branchId)}` : ''}
       ${trendDateFilter}
       GROUP BY DATE(o.created_at)
       ORDER BY date ASC`
    );

    // Cash flow summary
    // cash_in: Total payments received in this period (from payments table)
    // outstanding: Total unpaid balances across ALL orders (not filtered by period)
    const cashInResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as cash_in
       ${payFrom} 
       ${paymentsDateFilter}
       ${paymentsDateFilter ? 'AND' : 'WHERE'} COALESCE(is_cancelled, FALSE) = FALSE
       AND COALESCE(is_refund, FALSE) = FALSE`
    );

    const outstandingResult = await query(
      `SELECT COALESCE(SUM(
         GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))
       ), 0) as outstanding
       FROM orders 
       WHERE payment_status IN ('UNPAID', 'PARTIAL')${branchId ? ` AND branch_id = ${Number(branchId)}` : ''}`
    );

    const cashFlowResult = {
      rows: [{
        cash_in: cashInResult.rows[0].cash_in,
        outstanding: outstandingResult.rows[0].outstanding
      }]
    };

    // Pending expense approvals (expenses awaiting approval in current period)
    const pendingExpensesResult = await query(
      `SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as amount
       FROM expenses 
      ${expensesDateFilter ? `${expensesDateFilter} AND` : 'WHERE'} COALESCE(status, approval_status) = 'PENDING'`
    );

    // Payment methods breakdown (respects period filter)
    const paymentMethodsResult = await query(
      `SELECT 
        CASE 
          WHEN payment_method IN ('MOBILE_MONEY_MTN', 'MTN Mobile Money') THEN 'Mobile Money (MTN)'
          WHEN payment_method IN ('MOBILE_MONEY_AIRTEL', 'Airtel Money') THEN 'Mobile Money (Airtel)'
          WHEN payment_method = 'BANK_TRANSFER' THEN 'Bank Transfer'
          WHEN payment_method = 'CASH' THEN 'Cash'
          ELSE payment_method
        END as method,
        COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) as total_amount
       FROM payments
        ${paymentsDateFilter ? `${paymentsDateFilter} AND` : 'WHERE'}
        COALESCE(is_cancelled, FALSE) = FALSE
        AND COALESCE(is_refund, FALSE) = FALSE
        GROUP BY method
       ORDER BY total_amount DESC`
    );

    res.json({
      summary: summaryData,
      revenueBreakdown: revenueBreakdownResult.rows,
      paymentMethodsBreakdown: paymentMethodsResult.rows,
      topExpenses: topExpensesResult.rows,
      dailyTrend: trendResult.rows,
      cashFlow: cashFlowResult.rows[0],
      pendingExpenses: pendingExpensesResult.rows[0],
    });

  } catch (error) {
    console.error('Get financial dashboard error:', error);
    res.status(500).json({ error: 'Failed to get financial dashboard' });
  }
};

/**
 * Get detailed financial report
 */
export const getFinancialReport = async (req: AuthRequest, res: Response) => {
  try {
    const { from_date, to_date, group_by = 'day' } = req.query; // day, week, month

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required' });
    }

    let dateGrouping = '';
    switch (group_by) {
      case 'week':
        dateGrouping = "DATE_TRUNC('week', summary_date)";
        break;
      case 'month':
        dateGrouping = "DATE_TRUNC('month', summary_date)";
        break;
      default:
        dateGrouping = "summary_date";
    }

    const reportResult = await query(
      `SELECT 
        ${dateGrouping} as period,
        COALESCE(SUM(total_revenue), 0) as revenue,
        COALESCE(SUM(total_expenses), 0) as expenses,
        COALESCE(SUM(net_profit), 0) as profit,
        COALESCE(SUM(orders_count), 0) as orders,
        COALESCE(SUM(expenses_count), 0) as expense_records
       FROM financial_summary 
       WHERE summary_date BETWEEN $1 AND $2
       GROUP BY period
       ORDER BY period DESC`,
      [from_date, to_date]
    );

    // Expense breakdown by category
    const expenseBreakdownResult = await query(
      `SELECT 
        e.category as category,
        '#3B82F6' as color,
        COALESCE(SUM(e.amount), 0) as amount,
        COUNT(e.id) as count
       FROM expenses e
       WHERE e.status = 'APPROVED'
         AND e.expense_date BETWEEN $1 AND $2
       GROUP BY e.category
       HAVING COALESCE(SUM(e.amount), 0) > 0
       ORDER BY amount DESC`,
      [from_date, to_date]
    );

    // Revenue sources
    const revenueSourcesResult = await query(
      `SELECT 
        payment_status,
        COUNT(*) as order_count,
        COALESCE(SUM(COALESCE(total_amount, total, 0)), 0) as total_amount,
        COALESCE(SUM(amount_paid), 0) as amount_paid,
        COALESCE(SUM(GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))), 0) as balance
       FROM orders 
       WHERE DATE(created_at) BETWEEN $1 AND $2
       GROUP BY payment_status`,
      [from_date, to_date]
    );

    // Top customers by revenue
    const topCustomersResult = await query(
      `SELECT 
        c.name,
        c.phone,
        COUNT(o.id) as order_count,
        COALESCE(SUM(COALESCE(o.total_amount, o.total, 0)), 0) as total_spent
       FROM customers c
       INNER JOIN orders o ON c.id = o.customer_id
       WHERE DATE(o.created_at) BETWEEN $1 AND $2
       GROUP BY c.id, c.name, c.phone
       ORDER BY total_spent DESC
       LIMIT 10`,
      [from_date, to_date]
    );

    res.json({
      period: {
        from: from_date,
        to: to_date,
        grouping: group_by,
      },
      summary: reportResult.rows,
      expenseBreakdown: expenseBreakdownResult.rows,
      revenueSources: revenueSourcesResult.rows,
      topCustomers: topCustomersResult.rows,
    });

  } catch (error) {
    console.error('Get financial report error:', error);
    res.status(500).json({ error: 'Failed to generate financial report' });
  }
};

/**
 * Get profit/loss statement
 */
export const getProfitLossStatement = async (req: AuthRequest, res: Response) => {
  try {
    const { from_date, to_date } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required' });
    }

    // Revenue section
    const revenueResult = await query(
      `SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(COALESCE(total_amount, total, 0)), 0) as gross_revenue,
        COALESCE(SUM(COALESCE(discount_amount, 0)), 0) as total_discounts,
        COALESCE(SUM(amount_paid), 0) as cash_received,
        COALESCE(SUM(GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))), 0) as accounts_receivable
       FROM orders 
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [from_date, to_date]
    );

    // Expenses by category
    const expensesResult = await query(
      `SELECT 
        e.category as category,
        COALESCE(SUM(e.amount), 0) as amount
       FROM expenses e
       WHERE e.status = 'APPROVED'
         AND e.expense_date BETWEEN $1 AND $2
       GROUP BY e.category
       HAVING COALESCE(SUM(e.amount), 0) > 0
       ORDER BY e.category`,
      [from_date, to_date]
    );

    const revenue = revenueResult.rows[0];
    const totalExpenses = expensesResult.rows.reduce((sum, cat) => sum + parseFloat(cat.amount), 0);
    const netRevenue = parseFloat(revenue.gross_revenue) - parseFloat(revenue.total_discounts);
    const netProfit = netRevenue - totalExpenses;
    const profitMargin = netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(2) : 0;

    res.json({
      period: {
        from: from_date,
        to: to_date,
      },
      revenue: {
        gross_revenue: parseFloat(revenue.gross_revenue),
        discounts: parseFloat(revenue.total_discounts),
        net_revenue: netRevenue,
        cash_received: parseFloat(revenue.cash_received),
        outstanding: parseFloat(revenue.accounts_receivable),
      },
      expenses: {
        categories: expensesResult.rows,
        total: totalExpenses,
      },
      summary: {
        net_profit: netProfit,
        profit_margin: profitMargin + '%',
        total_orders: parseInt(revenue.total_orders),
      },
    });

  } catch (error) {
    console.error('Get profit/loss statement error:', error);
    res.status(500).json({ error: 'Failed to generate profit/loss statement' });
  }
};

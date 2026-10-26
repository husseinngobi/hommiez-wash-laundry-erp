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

    let paymentsDateFilter = '';
    let ordersDateFilter = '';
    let expensesDateFilter = '';
    let trendDateRange = '';

    const hasCustomRange = period === 'custom' && typeof from_date === 'string' && typeof to_date === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(from_date)
      && /^\d{4}-\d{2}-\d{2}$/.test(to_date)
      && from_date <= to_date;

    // Check if period is a specific year (e.g., '2021', '2022', '2023')
    if (hasCustomRange) {
      paymentsDateFilter = `WHERE payment_date >= DATE '${from_date}' AND payment_date < DATE '${to_date}' + INTERVAL '1 day'`;
      ordersDateFilter = `WHERE delivered_at >= DATE '${from_date}' AND delivered_at < DATE '${to_date}' + INTERVAL '1 day'`;
      expensesDateFilter = `WHERE expense_date >= DATE '${from_date}' AND expense_date < DATE '${to_date}' + INTERVAL '1 day'`;
      trendDateRange = `WHERE d.day >= DATE '${from_date}' AND d.day < DATE '${to_date}' + INTERVAL '1 day'`;
    } else if (period === 'custom') {
      return res.status(400).json({ error: 'Valid from_date and to_date are required for a custom range' });
    } else if (period && /^\d{4}$/.test(period as string)) {
      const year = period as string;
      paymentsDateFilter = `WHERE DATE_TRUNC('year', payment_date) = DATE_TRUNC('year', DATE '${year}-01-01')`;
      ordersDateFilter = `WHERE DATE_TRUNC('year', delivered_at) = DATE_TRUNC('year', DATE '${year}-01-01')`;
      expensesDateFilter = `WHERE DATE_TRUNC('year', expense_date) = DATE_TRUNC('year', DATE '${year}-01-01')`;
      trendDateRange = `WHERE d.day >= DATE '${year}-01-01' AND d.day < DATE '${Number(year) + 1}-01-01'`;
    } else {
      switch (period) {
        case 'all':
          paymentsDateFilter = '';
          ordersDateFilter = '';
          expensesDateFilter = '';
          trendDateRange = '';
          break;
        case 'today':
          paymentsDateFilter = "WHERE DATE(payment_date) = CURRENT_DATE";
          ordersDateFilter = "WHERE DATE(delivered_at) = CURRENT_DATE";
          expensesDateFilter = "WHERE DATE(expense_date) = CURRENT_DATE";
          trendDateRange = 'WHERE d.day = CURRENT_DATE';
          break;
        case 'week':
          paymentsDateFilter = "WHERE payment_date >= CURRENT_DATE - INTERVAL '7 days'";
          ordersDateFilter = "WHERE delivered_at >= CURRENT_DATE - INTERVAL '7 days'";
          expensesDateFilter = "WHERE expense_date >= CURRENT_DATE - INTERVAL '7 days'";
          trendDateRange = "WHERE d.day >= CURRENT_DATE - INTERVAL '6 days' AND d.day < CURRENT_DATE + INTERVAL '1 day'";
          break;
        case 'month':
          paymentsDateFilter = "WHERE DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)";
          ordersDateFilter = "WHERE DATE_TRUNC('month', delivered_at) = DATE_TRUNC('month', CURRENT_DATE)";
          expensesDateFilter = "WHERE DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', CURRENT_DATE)";
          trendDateRange = "WHERE d.day >= DATE_TRUNC('month', CURRENT_DATE)::date AND d.day < CURRENT_DATE + INTERVAL '1 day'";
          break;
        case 'year':
          paymentsDateFilter = "WHERE DATE_TRUNC('year', payment_date) = DATE_TRUNC('year', CURRENT_DATE)";
          ordersDateFilter = "WHERE DATE_TRUNC('year', delivered_at) = DATE_TRUNC('year', CURRENT_DATE)";
          expensesDateFilter = "WHERE DATE_TRUNC('year', expense_date) = DATE_TRUNC('year', CURRENT_DATE)";
          trendDateRange = "WHERE d.day >= DATE_TRUNC('year', CURRENT_DATE)::date AND d.day < CURRENT_DATE + INTERVAL '1 day'";
          break;
        default:
          paymentsDateFilter = "WHERE DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)";
          ordersDateFilter = "WHERE DATE_TRUNC('month', delivered_at) = DATE_TRUNC('month', CURRENT_DATE)";
          expensesDateFilter = "WHERE DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', CURRENT_DATE)";
          trendDateRange = "WHERE d.day >= DATE_TRUNC('month', CURRENT_DATE)::date AND d.day < CURRENT_DATE + INTERVAL '1 day'";
      }
    }

    ordersDateFilter = andBranchFilter(ordersDateFilter, 'branch_id', branchId);
    expensesDateFilter = andBranchFilter(expensesDateFilter, 'branch_id', branchId);
    const payFrom = paymentsFrom(branchId);

    // Earned revenue is recognized when service delivery is complete.
    const revenueResult = await query(
      `SELECT 
        COALESCE(SUM(total_amount - COALESCE(tax_amount, 0)), 0) as total_revenue,
        COUNT(*) as total_orders
       FROM orders
       ${ordersDateFilter ? `${ordersDateFilter} AND` : 'WHERE'} status = 'delivered' AND delivered_at IS NOT NULL`
    );

    const expensesResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_expenses,
              COUNT(*) as total_expense_records
       FROM expenses 
      ${expensesDateFilter ? `${expensesDateFilter} AND` : 'WHERE'} COALESCE(status, approval_status) = 'APPROVED' AND COALESCE(category, '') <> 'Salaries'`
    );

    const salariesResult = await query(
      `SELECT COALESCE(SUM(sp.net_amount), 0) as total_salaries
       FROM salary_payments sp JOIN payroll_employees pe ON pe.id = sp.employee_id
       ${expensesDateFilter ? `${expensesDateFilter.replace(/expense_date/g, 'sp.payment_date').replace(/\bbranch_id\b/g, 'pe.branch_id')} AND` : 'WHERE'} sp.payment_status = 'PAID'`
    );

    const refundsResult = await query(
      `SELECT COALESCE(SUM(ABS(p.amount) * ((o.total_amount - COALESCE(o.tax_amount, 0)) / NULLIF(o.total_amount, 0))), 0) AS total_refunds
       FROM payments p JOIN orders o ON o.id = p.order_id
       ${paymentsDateFilter ? `${paymentsDateFilter} AND` : 'WHERE'}
       COALESCE(p.is_cancelled, FALSE) = FALSE AND COALESCE(p.is_refund, FALSE) = TRUE
       AND o.status = 'delivered' ${branchId ? `AND o.branch_id = ${Number(branchId)}` : ''}`
    );

    const summaryData = {
      total_revenue: revenueResult.rows[0].total_revenue,
      total_orders: revenueResult.rows[0].total_orders,
      total_expenses: expensesResult.rows[0].total_expenses,
      total_expense_records: expensesResult.rows[0].total_expense_records,
      total_salaries: salariesResult.rows[0].total_salaries,
      net_profit: parseFloat(revenueResult.rows[0].total_revenue)
        - parseFloat(refundsResult.rows[0].total_refunds)
        - parseFloat(expensesResult.rows[0].total_expenses)
        - parseFloat(salariesResult.rows[0].total_salaries),
    };

    // Revenue by payment status
    const revenueBreakdownResult = await query(
      `SELECT 
        payment_status,
        COUNT(*) as count,
        COALESCE(SUM(COALESCE(total_amount, total, 0)), 0) as amount
       FROM orders 
       ${ordersDateFilter ? `${ordersDateFilter} AND` : 'WHERE'} status <> 'cancelled'
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
      ${expensesDateFilter ? `${expensesDateFilter} AND` : 'WHERE'} COALESCE(e.status, e.approval_status) = 'APPROVED' AND COALESCE(e.category, '') <> 'Salaries'
       GROUP BY e.category
       HAVING COALESCE(SUM(e.amount), 0) > 0
       ORDER BY amount DESC
       LIMIT 5`
    );

    // Aggregate each source by date before joining to avoid multiplying totals
    // when a day has multiple orders and multiple expenses.
    const trendResult = await query(
      `WITH earned_orders AS (
         SELECT DATE(o.delivered_at) AS day, COALESCE(SUM(o.total_amount - COALESCE(o.tax_amount, 0)), 0) AS revenue
         FROM orders o
         WHERE o.status = 'delivered' AND o.delivered_at IS NOT NULL
           ${branchId ? `AND o.branch_id = ${Number(branchId)}` : ''}
         GROUP BY DATE(o.delivered_at)
       ), refunds AS (
         SELECT DATE(p.payment_date) AS day,
                COALESCE(SUM(ABS(p.amount) * ((o.total_amount - COALESCE(o.tax_amount, 0)) / NULLIF(o.total_amount, 0))), 0) AS amount
         FROM payments p JOIN orders o ON o.id = p.order_id
         WHERE COALESCE(p.is_cancelled, FALSE) = FALSE
           AND COALESCE(p.is_refund, FALSE) = TRUE AND o.status = 'delivered'
           ${branchId ? `AND o.branch_id = ${Number(branchId)}` : ''}
         GROUP BY DATE(p.payment_date)
       ), expense_totals AS (
         SELECT DATE(e.expense_date) AS day, COALESCE(SUM(e.amount), 0) AS expenses
         FROM expenses e
         WHERE COALESCE(e.status, e.approval_status) = 'APPROVED'
           AND COALESCE(e.category, '') <> 'Salaries'
           ${branchId ? `AND e.branch_id = ${Number(branchId)}` : ''}
         GROUP BY DATE(e.expense_date)
       ), salary_totals AS (
         SELECT sp.payment_date AS day, COALESCE(SUM(sp.net_amount), 0) AS salaries
         FROM salary_payments sp JOIN payroll_employees pe ON pe.id = sp.employee_id
         WHERE sp.payment_status = 'PAID'
           ${branchId ? `AND pe.branch_id = ${Number(branchId)}` : ''}
         GROUP BY sp.payment_date
       ), days AS (
         SELECT day FROM earned_orders UNION SELECT day FROM refunds
         UNION SELECT day FROM expense_totals UNION SELECT day FROM salary_totals
       )
       SELECT d.day AS date,
              COALESCE(r.revenue, 0) - COALESCE(f.amount, 0) AS revenue,
              COALESCE(e.expenses, 0) AS expenses,
              COALESCE(s.salaries, 0) AS salaries,
              COALESCE(r.revenue, 0) - COALESCE(f.amount, 0)
                - COALESCE(e.expenses, 0) - COALESCE(s.salaries, 0) AS profit
       FROM days d
       LEFT JOIN earned_orders r ON r.day = d.day
       LEFT JOIN refunds f ON f.day = d.day
       LEFT JOIN expense_totals e ON e.day = d.day
       LEFT JOIN salary_totals s ON s.day = d.day
       ${trendDateRange}
       ORDER BY d.day ASC`
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
       WHERE status <> 'cancelled' AND payment_status IN ('UNPAID', 'PARTIAL')${branchId ? ` AND branch_id = ${Number(branchId)}` : ''}`
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
          WHEN p.payment_method IN ('MOBILE_MONEY_MTN', 'MTN Mobile Money') THEN 'Mobile Money (MTN)'
          WHEN p.payment_method IN ('MOBILE_MONEY_AIRTEL', 'Airtel Money') THEN 'Mobile Money (Airtel)'
          WHEN p.payment_method = 'BANK_TRANSFER' THEN 'Bank Transfer'
          WHEN p.payment_method = 'CASH' THEN 'Cash'
          ELSE p.payment_method
        END as method,
        COUNT(p.id) as transaction_count,
        COALESCE(SUM(p.amount), 0) as total_amount
       ${payFrom}
        ${paymentsDateFilter ? `${paymentsDateFilter.replace(/payment_date/g, 'p.payment_date')} AND` : 'WHERE'}
        COALESCE(p.is_cancelled, FALSE) = FALSE
        AND COALESCE(p.is_refund, FALSE) = FALSE
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

    const validRange = typeof from_date === 'string' && typeof to_date === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(from_date)
      && /^\d{4}-\d{2}-\d{2}$/.test(to_date)
      && from_date <= to_date;
    if (!validRange) {
      return res.status(400).json({ error: 'from_date and to_date are required' });
    }

    let dateGrouping = '';
    switch (group_by) {
      case 'week':
        dateGrouping = "DATE_TRUNC('week', activity_date)";
        break;
      case 'month':
        dateGrouping = "DATE_TRUNC('month', activity_date)";
        break;
      default:
        dateGrouping = "activity_date";
    }

    const reportResult = await query(
      `WITH activity AS (
         SELECT DATE(o.delivered_at) AS activity_date,
                COALESCE(SUM(o.total_amount - COALESCE(o.tax_amount, 0)), 0) AS revenue, 0::numeric AS expenses,
                COUNT(*)::bigint AS orders, 0::bigint AS expense_records
         FROM orders o
         WHERE o.status = 'delivered' AND o.delivered_at IS NOT NULL
           AND DATE(o.delivered_at) BETWEEN $1 AND $2
         GROUP BY DATE(o.delivered_at)
         UNION ALL
         SELECT DATE(p.payment_date),
                -COALESCE(SUM(ABS(p.amount) * ((o.total_amount - COALESCE(o.tax_amount, 0)) / NULLIF(o.total_amount, 0))), 0),
                0::numeric, 0::bigint, 0::bigint
         FROM payments p JOIN orders o ON o.id = p.order_id
         WHERE DATE(p.payment_date) BETWEEN $1 AND $2
           AND COALESCE(p.is_cancelled, FALSE) = FALSE
           AND COALESCE(p.is_refund, FALSE) = TRUE
           AND o.status = 'delivered'
         GROUP BY DATE(p.payment_date)
         UNION ALL
         SELECT DATE(e.expense_date), 0::numeric,
                COALESCE(SUM(e.amount), 0), 0::bigint, COUNT(*)::bigint
         FROM expenses e
         WHERE DATE(e.expense_date) BETWEEN $1 AND $2
           AND COALESCE(e.status, e.approval_status) = 'APPROVED'
           AND COALESCE(e.category, '') <> 'Salaries'
         GROUP BY DATE(e.expense_date)
         UNION ALL
         SELECT DATE(sp.payment_date), 0::numeric,
                COALESCE(SUM(sp.net_amount), 0), 0::bigint, COUNT(*)::bigint
         FROM salary_payments sp
         WHERE sp.payment_status = 'PAID'
           AND DATE(sp.payment_date) BETWEEN $1 AND $2
         GROUP BY DATE(sp.payment_date)
       )
       SELECT ${dateGrouping} AS period,
              COALESCE(SUM(revenue), 0) AS revenue,
              COALESCE(SUM(expenses), 0) AS expenses,
              COALESCE(SUM(revenue - expenses), 0) AS profit,
              COALESCE(SUM(orders), 0) AS orders,
              COALESCE(SUM(expense_records), 0) AS expense_records
       FROM activity
       GROUP BY period
       ORDER BY period DESC`,
      [from_date, to_date]
    );

    // Approved operating expenses plus paid payroll, using their respective
    // recorded dates. Legacy Salaries expense rows are excluded to avoid
    // counting payroll twice.
    const expenseBreakdownResult = await query(
      `SELECT category, '#3B82F6' as color, SUM(amount) as amount, SUM(count)::bigint as count
       FROM (
         SELECT e.category, SUM(e.amount) as amount, COUNT(e.id)::bigint as count
         FROM expenses e
         WHERE COALESCE(e.status, e.approval_status) = 'APPROVED'
           AND COALESCE(e.category, '') <> 'Salaries'
           AND e.expense_date BETWEEN $1 AND $2
         GROUP BY e.category
         UNION ALL
         SELECT 'Payroll' as category, SUM(sp.net_amount) as amount, COUNT(*)::bigint as count
         FROM salary_payments sp
         WHERE sp.payment_status = 'PAID' AND sp.payment_date BETWEEN $1 AND $2
         HAVING COALESCE(SUM(sp.net_amount), 0) > 0
       ) expense_items
       GROUP BY category
       HAVING SUM(amount) > 0
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
       WHERE status = 'delivered' AND DATE(delivered_at) BETWEEN $1 AND $2
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
       WHERE o.status = 'delivered' AND DATE(o.delivered_at) BETWEEN $1 AND $2
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
        COALESCE(SUM(COALESCE(total_amount, total, 0) - COALESCE(tax_amount, 0)), 0) as gross_revenue,
        COALESCE(SUM(COALESCE(discount_amount, 0)), 0) as total_discounts,
        COALESCE(SUM(COALESCE(amount_paid, 0)), 0) as cash_received,
        COALESCE(SUM(GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))), 0) as accounts_receivable
       FROM orders 
       WHERE status = 'delivered' AND delivered_at IS NOT NULL
         AND DATE(delivered_at) BETWEEN $1 AND $2`,
      [from_date, to_date]
    );

    // Expenses by category
    const expensesResult = await query(
      `SELECT 
        e.category as category,
        COALESCE(SUM(e.amount), 0) as amount
       FROM expenses e
       WHERE COALESCE(e.status, e.approval_status) = 'APPROVED'
         AND COALESCE(e.category, '') <> 'Salaries'
         AND e.expense_date BETWEEN $1 AND $2
       GROUP BY e.category
       HAVING COALESCE(SUM(e.amount), 0) > 0
       ORDER BY e.category`,
      [from_date, to_date]
    );

    const revenue = revenueResult.rows[0];
    const salariesResult = await query(
      `SELECT COALESCE(SUM(sp.net_amount), 0) AS amount
       FROM salary_payments sp
       WHERE sp.payment_status = 'PAID' AND sp.payment_date BETWEEN $1 AND $2`,
      [from_date, to_date]
    );
    const refundResult = await query(
      `SELECT COALESCE(SUM(ABS(p.amount) * ((o.total_amount - COALESCE(o.tax_amount, 0)) / NULLIF(o.total_amount, 0))), 0) AS amount
       FROM payments p JOIN orders o ON o.id = p.order_id
       WHERE COALESCE(p.is_cancelled, FALSE) = FALSE
         AND COALESCE(p.is_refund, FALSE) = TRUE AND o.status = 'delivered'
         AND DATE(p.payment_date) BETWEEN $1 AND $2`,
      [from_date, to_date]
    );
    const totalExpenses = expensesResult.rows.reduce((sum, cat) => sum + parseFloat(cat.amount), 0)
      + (Number(salariesResult.rows[0].amount) || 0);
    const refunds = Number(refundResult.rows[0].amount) || 0;
    const netRevenue = parseFloat(revenue.gross_revenue) - refunds;
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
        refunds,
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

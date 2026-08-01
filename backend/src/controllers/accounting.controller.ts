import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

/**
 * Get Income Statement (Profit & Loss Statement)
 * Shows: Revenue, COGS, Gross Profit, Operating Expenses, Net Profit
 */
export const getIncomeStatement = async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'all', from_date, to_date } = req.query;

    let dateFilter = '';
    let paymentDateFilter = '';
    let expenseDateFilter = '';
    
    if (from_date && to_date) {
      dateFilter = `WHERE created_at >= '${from_date}' AND created_at <= '${to_date}'`;
      paymentDateFilter = `WHERE p.payment_date >= '${from_date}' AND p.payment_date <= '${to_date}'`;
      expenseDateFilter = `WHERE expense_date >= '${from_date}' AND expense_date <= '${to_date}'`;
    } else {
      switch (period) {
        case 'all':
          dateFilter = '';
          paymentDateFilter = '';
          expenseDateFilter = '';
          break;
        case 'today':
          dateFilter = "WHERE DATE(o.created_at) = CURRENT_DATE";
          paymentDateFilter = "WHERE DATE(p.payment_date) = CURRENT_DATE";
          expenseDateFilter = "WHERE DATE(expense_date) = CURRENT_DATE";
          break;
        case 'week':
          dateFilter = "WHERE o.created_at >= CURRENT_DATE - INTERVAL '7 days'";
          paymentDateFilter = "WHERE p.payment_date >= CURRENT_DATE - INTERVAL '7 days'";
          expenseDateFilter = "WHERE expense_date >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case 'month':
          dateFilter = "WHERE DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', CURRENT_DATE)";
          paymentDateFilter = "WHERE DATE_TRUNC('month', p.payment_date) = DATE_TRUNC('month', CURRENT_DATE)";
          expenseDateFilter = "WHERE DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', CURRENT_DATE)";
          break;
        case 'year':
          dateFilter = "WHERE DATE_TRUNC('year', o.created_at) = DATE_TRUNC('year', CURRENT_DATE)";
          paymentDateFilter = "WHERE DATE_TRUNC('year', p.payment_date) = DATE_TRUNC('year', CURRENT_DATE)";
          expenseDateFilter = "WHERE DATE_TRUNC('year', expense_date) = DATE_TRUNC('year', CURRENT_DATE)";
          break;
        default:
          dateFilter = '';
          paymentDateFilter = '';
          expenseDateFilter = '';
      }
    }

    // Revenue (from payments table — cash actually received)
    // is_refund may be missing on older DBs; COALESCE treats NULL as not-refund
    const revenueResult = await query(`
      SELECT 
        COALESCE(SUM(CASE WHEN COALESCE(is_refund, FALSE) = FALSE THEN amount ELSE 0 END), 0) as total_payments,
        COALESCE(SUM(CASE WHEN COALESCE(is_refund, FALSE) = TRUE THEN ABS(amount) ELSE 0 END), 0) as total_refunds,
        COALESCE(SUM(amount), 0) as net_revenue,
        COUNT(DISTINCT CASE WHEN COALESCE(is_refund, FALSE) = FALSE THEN order_id END) as total_orders,
        COUNT(CASE WHEN COALESCE(is_refund, FALSE) = TRUE THEN 1 END) as refund_count
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      ${paymentDateFilter}
    `);

    // Revenue by service category (only counting actual payments, not refunds)
    const revenueByCategoryResult = await query(`
      SELECT 
        pi.category,
        ROUND(COALESCE(SUM(oi.total_price * (p.amount / NULLIF(o.total_amount, 0))), 0)) as revenue,
        COUNT(DISTINCT o.id) as order_count
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      JOIN order_items oi ON o.id = oi.order_id
      JOIN price_items pi ON oi.price_item_id = pi.id
      ${paymentDateFilter}
        AND COALESCE(p.is_refund, FALSE) = FALSE
      GROUP BY pi.category
      ORDER BY revenue DESC
    `);

    // Operating Expenses by category
    const expensesByCategoryResult = await query(`
      SELECT 
        category,
        COALESCE(SUM(amount), 0) as amount,
        COUNT(*) as count
      FROM expenses
      ${expenseDateFilter}
        AND approval_status = 'APPROVED'
        AND category != 'Salaries'
      GROUP BY category
      ORDER BY amount DESC
    `);

    // Salaries (separate from operating expenses)
    const salariesResult = await query(`
      SELECT 
        COALESCE(SUM(net_amount), 0) as total_salaries,
        COUNT(*) as payment_count
      FROM salary_payments
      ${expenseDateFilter.replace('expense_date', 'payment_date')}
        AND payment_status = 'PAID'
    `);

    // Total expenses (excluding salaries)
    const totalExpensesResult = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      ${expenseDateFilter}
        AND approval_status = 'APPROVED'
        AND category != 'Salaries'
    `);

    const totalPayments = parseFloat(revenueResult.rows[0].total_payments);
    const totalRefunds = parseFloat(revenueResult.rows[0].total_refunds);
    const netRevenue = parseFloat(revenueResult.rows[0].net_revenue);
    const totalExpenses = parseFloat(totalExpensesResult.rows[0].total_expenses);
    const totalSalaries = parseFloat(salariesResult.rows[0].total_salaries);
    const grossProfit = netRevenue - totalExpenses;
    const netProfit = grossProfit - totalSalaries;

    // VAT Summary (separate tracking)
    const vatResult = await query(`
      SELECT 
        COUNT(*) as orders_with_vat,
        COALESCE(SUM(tax_amount), 0) as total_vat_collected,
        COALESCE(SUM(total_amount), 0) as revenue_inc_vat,
        COALESCE(SUM(total_amount - COALESCE(tax_amount, 0)), 0) as revenue_exc_vat
      FROM orders o
      ${dateFilter}
        AND tax_amount > 0
    `);

    const vatSummary = {
      orders_with_vat: parseInt(vatResult.rows[0].orders_with_vat),
      total_vat_collected: parseFloat(vatResult.rows[0].total_vat_collected),
      revenue_inc_vat: parseFloat(vatResult.rows[0].revenue_inc_vat),
      revenue_exc_vat: parseFloat(vatResult.rows[0].revenue_exc_vat),
    };

    res.json({
      period: period || `${from_date} to ${to_date}`,
      revenue: {
        total: netRevenue, // UI + exports expect revenue.total
        gross_payments: totalPayments,
        refunds: totalRefunds,
        net_revenue: netRevenue,
        order_count: parseInt(revenueResult.rows[0].total_orders),
        refund_count: parseInt(revenueResult.rows[0].refund_count),
        by_category: revenueByCategoryResult.rows.map(row => ({
          category: row.category,
          revenue: parseFloat(row.revenue),
          order_count: parseInt(row.order_count),
        })),
      },
      vat_summary: vatSummary, // NEW: VAT breakdown
      cost_of_goods_sold: 0, // Laundry service has minimal COGS
      gross_profit: grossProfit,
      operating_expenses: {
        total: totalExpenses,
        by_category: expensesByCategoryResult.rows.map(row => ({
          category: row.category,
          amount: parseFloat(row.amount),
          count: parseInt(row.count),
        })),
      },
      salaries: {
        total: totalSalaries,
        payment_count: parseInt(salariesResult.rows[0].payment_count),
      },
      net_profit: netProfit,
      profit_margin: netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(2) : '0.00',
    });
  } catch (error) {
    console.error('Income statement error:', error);
    res.status(500).json({ error: 'Failed to generate income statement' });
  }
};

/**
 * Get Balance Sheet
 * Shows: Assets, Liabilities, Equity
 */
export const getBalanceSheet = async (req: AuthRequest, res: Response) => {
  try {
    const { as_of_date = new Date().toISOString().split('T')[0] } = req.query;

    // ASSETS
    // 1. Cash (revenue collected)
    const cashResult = await query(`
      SELECT COALESCE(SUM(amount_paid), 0) as cash
      FROM orders
      WHERE payment_status = 'PAID'
        AND created_at <= $1
    `, [as_of_date]);

    // 2. Accounts Receivable (outstanding customer balances)
    const accountsReceivableResult = await query(`
      SELECT COALESCE(SUM(
        GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))
      ), 0) as accounts_receivable
      FROM orders
      WHERE payment_status IN ('UNPAID', 'PARTIAL')
        AND created_at <= $1
    `, [as_of_date]);

    // 3. Inventory value (current stock)
    const inventoryResult = await query(`
      SELECT COALESCE(SUM(quantity * unit_cost), 0) as inventory_value
      FROM inventory_items
      WHERE created_at <= $1
    `, [as_of_date]);

    // LIABILITIES
    // 1. Accounts Payable (pending/unpaid expenses)
    const accountsPayableResult = await query(`
      SELECT COALESCE(SUM(amount), 0) as accounts_payable
      FROM expenses
      WHERE approval_status IN ('PENDING', 'APPROVED')
        AND expense_date <= $1
    `, [as_of_date]);

    // 2. Accrued Salaries (unpaid salary obligations)
    const accruedSalariesResult = await query(`
      SELECT COALESCE(SUM(salary_amount), 0) as accrued_salaries
      FROM payroll_employees
      WHERE employment_status = 'ACTIVE'
        AND hire_date <= $1
        AND id NOT IN (
          SELECT employee_id 
          FROM salary_payments 
          WHERE payment_period = TO_CHAR($1::DATE, 'FMMonth YYYY')
        )
    `, [as_of_date]);

    const totalAssets = 
      parseFloat(cashResult.rows[0].cash) +
      parseFloat(accountsReceivableResult.rows[0].accounts_receivable) +
      parseFloat(inventoryResult.rows[0].inventory_value);

    const totalLiabilities = 
      parseFloat(accountsPayableResult.rows[0].accounts_payable) +
      parseFloat(accruedSalariesResult.rows[0].accrued_salaries);

    const totalEquity = totalAssets - totalLiabilities;

    res.json({
      as_of_date,
      assets: {
        current_assets: {
          cash: parseFloat(cashResult.rows[0].cash),
          accounts_receivable: parseFloat(accountsReceivableResult.rows[0].accounts_receivable),
          inventory: parseFloat(inventoryResult.rows[0].inventory_value),
          total: totalAssets,
        },
        fixed_assets: {
          equipment: 0, // TODO: Add equipment tracking
          total: 0,
        },
        total_assets: totalAssets,
      },
      liabilities: {
        current_liabilities: {
          accounts_payable: parseFloat(accountsPayableResult.rows[0].accounts_payable),
          accrued_salaries: parseFloat(accruedSalariesResult.rows[0].accrued_salaries),
          total: totalLiabilities,
        },
        long_term_liabilities: {
          loans: 0, // TODO: Add loan tracking
          total: 0,
        },
        total_liabilities: totalLiabilities,
      },
      equity: {
        retained_earnings: totalEquity,
        total_equity: totalEquity,
      },
      balance_check: {
        assets: totalAssets,
        liabilities_plus_equity: totalLiabilities + totalEquity,
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      },
    });
  } catch (error) {
    console.error('Balance sheet error:', error);
    res.status(500).json({ error: 'Failed to generate balance sheet' });
  }
};

/**
 * Get Cash Flow Statement
 * Shows: Operating, Investing, Financing activities
 */
export const getCashFlowStatement = async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'all', from_date, to_date } = req.query;

    let dateFilter = '';
    if (from_date && to_date) {
      dateFilter = `WHERE created_at >= '${from_date}' AND created_at <= '${to_date}'`;
    } else {
      switch (period) {
        case 'all':
          dateFilter = '';
          break;
        case 'month':
          dateFilter = "WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)";
          break;
        case 'year':
          dateFilter = "WHERE DATE_TRUNC('year', created_at) = DATE_TRUNC('year', CURRENT_DATE)";
          break;
        default:
          dateFilter = '';
      }
    }

    // Operating Activities
    const cashFromCustomersResult = await query(`
      SELECT COALESCE(SUM(amount_paid), 0) as cash_from_customers
      FROM orders
      ${dateFilter}
        AND payment_status = 'PAID'
    `);

    const cashForExpensesResult = await query(`
      SELECT COALESCE(SUM(amount), 0) as cash_for_expenses
      FROM expenses
      ${dateFilter.replace('created_at', 'expense_date')}
        AND approval_status = 'APPROVED'
    `);

    const cashForSalariesResult = await query(`
      SELECT COALESCE(SUM(net_amount), 0) as cash_for_salaries
      FROM salary_payments
      ${dateFilter.replace('created_at', 'payment_date')}
        AND payment_status = 'PAID'
    `);

    // Investing Activities (equipment, inventory purchases)
    // Note: inventory_transactions doesn't track cost, defaulting to 0
    const cashForInventory = 0;

    const cashFromOperating = 
      parseFloat(cashFromCustomersResult.rows[0].cash_from_customers) -
      parseFloat(cashForExpensesResult.rows[0].cash_for_expenses) -
      parseFloat(cashForSalariesResult.rows[0].cash_for_salaries);

    const cashFromInvesting = -cashForInventory;

    const netCashFlow = cashFromOperating + cashFromInvesting;

    res.json({
      period: period || `${from_date} to ${to_date}`,
      operating_activities: {
        cash_from_customers: parseFloat(cashFromCustomersResult.rows[0].cash_from_customers),
        cash_paid_for_expenses: -parseFloat(cashForExpensesResult.rows[0].cash_for_expenses),
        cash_paid_for_salaries: -parseFloat(cashForSalariesResult.rows[0].cash_for_salaries),
        net_cash_from_operations: cashFromOperating,
      },
      investing_activities: {
        inventory_purchases: -cashForInventory,
        equipment_purchases: 0, // TODO: Add equipment tracking
        net_cash_from_investing: cashFromInvesting,
      },
      financing_activities: {
        owner_investments: 0, // TODO: Add capital tracking
        loan_proceeds: 0,
        loan_repayments: 0,
        net_cash_from_financing: 0,
      },
      net_increase_in_cash: netCashFlow,
      cash_at_beginning: 0, // TODO: Track opening balance
      cash_at_end: netCashFlow,
    });
  } catch (error) {
    console.error('Cash flow statement error:', error);
    res.status(500).json({ error: 'Failed to generate cash flow statement' });
  }
};

/**
 * Get Trial Balance
 * Lists all accounts with debit/credit balances
 */
export const getTrialBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { as_of_date = new Date().toISOString().split('T')[0] } = req.query;

    // Revenue (Credit)
    const revenueResult = await query(`
      SELECT COALESCE(SUM(amount_paid), 0) as balance
      FROM orders
      WHERE created_at <= $1
    `, [as_of_date]);

    // Expenses (Debit)
    const expensesResult = await query(`
      SELECT 
        category,
        COALESCE(SUM(amount), 0) as balance
      FROM expenses
      WHERE expense_date <= $1
        AND approval_status = 'APPROVED'
      GROUP BY category
    `, [as_of_date]);

    // Salaries (Debit)
    const salariesResult = await query(`
      SELECT COALESCE(SUM(net_amount), 0) as balance
      FROM salary_payments
      WHERE payment_date <= $1
        AND payment_status = 'PAID'
    `, [as_of_date]);

    // Cash (Debit)
    const cashResult = await query(`
      SELECT COALESCE(SUM(amount_paid), 0) as balance
      FROM orders
      WHERE payment_status = 'PAID'
        AND created_at <= $1
    `, [as_of_date]);

    // Accounts Receivable (Debit)
    const arResult = await query(`
      SELECT COALESCE(SUM(
        GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))
      ), 0) as balance
      FROM orders
      WHERE payment_status IN ('UNPAID', 'PARTIAL')
        AND created_at <= $1
    `, [as_of_date]);

    const accounts = [
      { account_code: '1100', account_name: 'Cash', debit: parseFloat(cashResult.rows[0].balance), credit: 0 },
      { account_code: '1200', account_name: 'Accounts Receivable', debit: parseFloat(arResult.rows[0].balance), credit: 0 },
      { account_code: '4000', account_name: 'Revenue - Laundry Services', debit: 0, credit: parseFloat(revenueResult.rows[0].balance) },
    ];

    // Add expenses by category
    let expenseCode = 5000;
    expensesResult.rows.forEach((expense: any) => {
      accounts.push({
        account_code: expenseCode.toString(),
        account_name: `Expense - ${expense.category}`,
        debit: parseFloat(expense.balance),
        credit: 0,
      });
      expenseCode += 100;
    });

    // Add salaries
    accounts.push({
      account_code: '6000',
      account_name: 'Salaries & Wages',
      debit: parseFloat(salariesResult.rows[0].balance),
      credit: 0,
    });

    const totalDebits = accounts.reduce((sum, acc) => sum + acc.debit, 0);
    const totalCredits = accounts.reduce((sum, acc) => sum + acc.credit, 0);

    res.json({
      as_of_date,
      accounts,
      totals: {
        total_debits: totalDebits,
        total_credits: totalCredits,
        difference: Math.abs(totalDebits - totalCredits),
        balanced: Math.abs(totalDebits - totalCredits) < 0.01,
      },
    });
  } catch (error) {
    console.error('Trial balance error:', error);
    res.status(500).json({ error: 'Failed to generate trial balance' });
  }
};

/**
 * Get Aged Receivables Report
 * Shows outstanding customer balances by age
 */
export const getAgedReceivables = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        o.id,
        o.order_number,
        c.name as customer_name,
        c.phone as customer_phone,
        o.total_amount,
        o.amount_paid,
        GREATEST(0, COALESCE(o.total_amount, o.total, 0) - COALESCE(o.amount_paid, 0)) as balance,
        o.created_at,
        CURRENT_DATE - DATE(o.created_at) as days_outstanding,
        CASE 
          WHEN CURRENT_DATE - DATE(o.created_at) <= 30 THEN '0-30 days'
          WHEN CURRENT_DATE - DATE(o.created_at) <= 60 THEN '31-60 days'
          WHEN CURRENT_DATE - DATE(o.created_at) <= 90 THEN '61-90 days'
          ELSE '90+ days'
        END as aging_bucket
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.payment_status IN ('UNPAID', 'PARTIAL')
        AND GREATEST(0, COALESCE(o.total_amount, o.total, 0) - COALESCE(o.amount_paid, 0)) > 0
      ORDER BY o.created_at ASC
    `);

    // Group by aging bucket
    const summary = {
      '0-30 days': { count: 0, amount: 0 },
      '31-60 days': { count: 0, amount: 0 },
      '61-90 days': { count: 0, amount: 0 },
      '90+ days': { count: 0, amount: 0 },
    };

    result.rows.forEach((row: any) => {
      const bucket = row.aging_bucket as keyof typeof summary;
      summary[bucket].count += 1;
      summary[bucket].amount += parseFloat(row.balance);
    });

    const totalOutstanding = Object.values(summary).reduce((sum, bucket) => sum + bucket.amount, 0);

    res.json({
      details: result.rows,
      summary,
      total_outstanding: totalOutstanding,
      total_invoices: result.rows.length,
    });
  } catch (error) {
    console.error('Aged receivables error:', error);
    res.status(500).json({ error: 'Failed to generate aged receivables report' });
  }
};

/**
 * Get Financial Ratios
 * Key business health metrics
 */
export const getFinancialRatios = async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'all' } = req.query;

    let dateFilter = '';
    switch (period) {
      case 'all':
        dateFilter = '';
        break;
      case 'month':
        dateFilter = "WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)";
        break;
      case 'year':
        dateFilter = "WHERE DATE_TRUNC('year', created_at) = DATE_TRUNC('year', CURRENT_DATE)";
        break;
      default:
        dateFilter = '';
    }

    // Get income statement data
    const revenueResult = await query(`SELECT COALESCE(SUM(amount_paid), 0) as revenue FROM orders ${dateFilter}`);
    const expensesResult = await query(`SELECT COALESCE(SUM(amount), 0) as expenses FROM expenses ${dateFilter.replace('created_at', 'expense_date')} AND approval_status = 'APPROVED'`);
    const salariesResult = await query(`SELECT COALESCE(SUM(net_amount), 0) as salaries FROM salary_payments ${dateFilter.replace('created_at', 'payment_date')} AND payment_status = 'PAID'`);

    // Get balance sheet data
    const assetsResult = await query(`
      SELECT COALESCE(SUM(amount_paid), 0) + COALESCE((
        SELECT SUM(GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0)))
        FROM orders WHERE payment_status IN ('UNPAID', 'PARTIAL')
      ), 0) as assets
      FROM orders WHERE payment_status = 'PAID'
    `);
    const liabilitiesResult = await query(`SELECT COALESCE(SUM(amount), 0) as liabilities FROM expenses WHERE approval_status IN ('PENDING', 'APPROVED')`);

    const revenue = parseFloat(revenueResult.rows[0].revenue);
    const expenses = parseFloat(expensesResult.rows[0].expenses);
    const salaries = parseFloat(salariesResult.rows[0].salaries);
    const netProfit = revenue - expenses - salaries;
    const assets = parseFloat(assetsResult.rows[0].assets);
    const liabilities = parseFloat(liabilitiesResult.rows[0].liabilities);
    const equity = assets - liabilities;

    res.json({
      period,
      profitability_ratios: {
        gross_profit_margin: revenue > 0 ? (((revenue - expenses) / revenue) * 100).toFixed(2) : '0.00',
        net_profit_margin: revenue > 0 ? ((netProfit / revenue) * 100).toFixed(2) : '0.00',
        return_on_assets: assets > 0 ? ((netProfit / assets) * 100).toFixed(2) : '0.00',
        return_on_equity: equity > 0 ? ((netProfit / equity) * 100).toFixed(2) : '0.00',
      },
      liquidity_ratios: {
        current_ratio: liabilities > 0 ? (assets / liabilities).toFixed(2) : 'N/A',
        quick_ratio: liabilities > 0 ? (assets / liabilities).toFixed(2) : 'N/A',
      },
      efficiency_ratios: {
        asset_turnover: assets > 0 ? (revenue / assets).toFixed(2) : '0.00',
      },
      leverage_ratios: {
        debt_to_equity: equity > 0 ? (liabilities / equity).toFixed(2) : 'N/A',
        debt_to_assets: assets > 0 ? ((liabilities / assets) * 100).toFixed(2) : '0.00',
      },
    });
  } catch (error) {
    console.error('Financial ratios error:', error);
    res.status(500).json({ error: 'Failed to calculate financial ratios' });
  }
};

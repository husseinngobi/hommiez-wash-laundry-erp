import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { resolveListBranchId } from '../utils/branchScope';

/**
 * Get Income Statement (Profit & Loss Statement)
 * Shows: Revenue, COGS, Gross Profit, Operating Expenses, Net Profit
 */
export const getIncomeStatement = async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'all', from_date, to_date, year, branch_id } = req.query;
    const branchId = resolveListBranchId(req, branch_id);

    let dateFilter = '';
    let paymentDateFilter = '';
    let expenseDateFilter = '';
    const selectedYear = typeof year === 'string' ? Number(year) : NaN;
    const hasSelectedYear = Number.isInteger(selectedYear) && selectedYear >= 2000;
    const yearStart = hasSelectedYear ? `${selectedYear}-01-01` : '';
    const yearEnd = hasSelectedYear ? `${selectedYear + 1}-01-01` : '';
    
    if (from_date && to_date) {
      const validRange = typeof from_date === 'string'
        && typeof to_date === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(from_date)
        && /^\d{4}-\d{2}-\d{2}$/.test(to_date)
        && from_date <= to_date;
      if (!validRange) {
        return res.status(400).json({ error: 'Valid from_date and to_date are required' });
      }
      dateFilter = `WHERE o.delivered_at >= DATE '${from_date}' AND o.delivered_at < DATE '${to_date}' + INTERVAL '1 day'`;
      paymentDateFilter = `WHERE p.payment_date >= DATE '${from_date}' AND p.payment_date < DATE '${to_date}' + INTERVAL '1 day'`;
      expenseDateFilter = `WHERE expense_date >= DATE '${from_date}' AND expense_date < DATE '${to_date}' + INTERVAL '1 day'`;
    } else {
      switch (period) {
        case 'all':
          dateFilter = '';
          paymentDateFilter = '';
          expenseDateFilter = '';
          break;
        case 'today':
          dateFilter = "WHERE DATE(o.delivered_at) = CURRENT_DATE";
          paymentDateFilter = "WHERE DATE(p.payment_date) = CURRENT_DATE";
          expenseDateFilter = "WHERE DATE(expense_date) = CURRENT_DATE";
          break;
        case 'week':
          dateFilter = "WHERE o.delivered_at >= CURRENT_DATE - INTERVAL '7 days'";
          paymentDateFilter = "WHERE p.payment_date >= CURRENT_DATE - INTERVAL '7 days'";
          expenseDateFilter = "WHERE expense_date >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case 'month':
          dateFilter = "WHERE DATE_TRUNC('month', o.delivered_at) = DATE_TRUNC('month', CURRENT_DATE)";
          paymentDateFilter = "WHERE DATE_TRUNC('month', p.payment_date) = DATE_TRUNC('month', CURRENT_DATE)";
          expenseDateFilter = "WHERE DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', CURRENT_DATE)";
          break;
        case 'year':
          if (yearStart && yearEnd) {
            dateFilter = `WHERE o.delivered_at >= '${yearStart}' AND o.delivered_at < '${yearEnd}'`;
            paymentDateFilter = `WHERE p.payment_date >= '${yearStart}' AND p.payment_date < '${yearEnd}'`;
            expenseDateFilter = `WHERE expense_date >= '${yearStart}' AND expense_date < '${yearEnd}'`;
          } else {
            dateFilter = "WHERE DATE_TRUNC('year', o.delivered_at) = DATE_TRUNC('year', CURRENT_DATE)";
            paymentDateFilter = "WHERE DATE_TRUNC('year', p.payment_date) = DATE_TRUNC('year', CURRENT_DATE)";
            expenseDateFilter = "WHERE DATE_TRUNC('year', expense_date) = DATE_TRUNC('year', CURRENT_DATE)";
          }
          break;
        default:
          dateFilter = '';
          paymentDateFilter = '';
          expenseDateFilter = '';
      }
    }

    const appendFilter = (baseFilter: string, clause: string) => {
      if (!baseFilter) return `WHERE ${clause}`;
      return `${baseFilter}\n        AND ${clause}`;
    };

    if (branchId) {
      paymentDateFilter = appendFilter(paymentDateFilter, `o.branch_id = ${Number(branchId)}`);
      dateFilter = appendFilter(dateFilter, `o.branch_id = ${Number(branchId)}`);
      expenseDateFilter = appendFilter(expenseDateFilter, `branch_id = ${Number(branchId)}`);
    }

    // Revenue (from payments table — cash actually received)
    // is_refund may be missing on older DBs; COALESCE treats NULL as not-refund
    const revenueResult = await query(`
      SELECT COALESCE(SUM(o.total_amount - COALESCE(o.tax_amount, 0)), 0) AS earned_revenue, COUNT(*) AS total_orders
      FROM orders o
      ${appendFilter(dateFilter, "o.status = 'delivered' AND o.delivered_at IS NOT NULL")}
    `);
    const cashActivityResult = await query(`
      SELECT
        COALESCE(SUM(p.amount) FILTER (WHERE COALESCE(p.is_refund, FALSE) = FALSE), 0) AS total_payments,
        COALESCE(SUM(ABS(p.amount) * ((o.total_amount - COALESCE(o.tax_amount, 0)) / NULLIF(o.total_amount, 0))) FILTER (WHERE COALESCE(p.is_refund, FALSE) = TRUE AND o.delivered_at IS NOT NULL), 0) AS total_refunds,
      COUNT(*) FILTER (WHERE COALESCE(p.is_refund, FALSE) = TRUE AND o.delivered_at IS NOT NULL) AS refund_count
      FROM payments p JOIN orders o ON p.order_id = o.id
      ${appendFilter(paymentDateFilter, 'COALESCE(p.is_cancelled, FALSE) = FALSE')}
    `);

    // Revenue by service category (only counting actual payments, not refunds)
    const revenueByCategoryResult = await query(`
      SELECT 
        pi.category,
        ROUND(COALESCE(SUM(oi.total_price), 0)) as revenue,
        COUNT(DISTINCT o.id) as order_count
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN price_items pi ON oi.price_item_id = pi.id
      ${appendFilter(dateFilter, "o.status = 'delivered' AND o.delivered_at IS NOT NULL")}
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
      ${appendFilter(
        appendFilter(expenseDateFilter, "COALESCE(status, approval_status) = 'APPROVED'"),
        "category != 'Salaries'"
      )}
      GROUP BY category
      ORDER BY amount DESC
    `);

    // Salaries (separate from operating expenses)
    const salariesResult = await query(`
      SELECT 
        COALESCE(SUM(net_amount), 0) as total_salaries,
        COUNT(*) as payment_count
      FROM salary_payments sp
      JOIN payroll_employees pe ON pe.id = sp.employee_id
      ${appendFilter(
        expenseDateFilter.replace('expense_date', 'sp.payment_date').replace(/\bbranch_id\b/g, 'pe.branch_id'),
        "sp.payment_status = 'PAID'"
      )}
    `);

    // Total expenses (excluding salaries)
    const totalExpensesResult = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      ${appendFilter(
        appendFilter(expenseDateFilter, "COALESCE(status, approval_status) = 'APPROVED'"),
        "category != 'Salaries'"
      )}
    `);

    const totalPayments = Number(cashActivityResult.rows[0].total_payments) || 0;
    const totalRefunds = Number(cashActivityResult.rows[0].total_refunds) || 0;
    const netRevenue = (Number(revenueResult.rows[0].earned_revenue) || 0) - totalRefunds;
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
      ${appendFilter(dateFilter, "o.status = 'delivered' AND o.delivered_at IS NOT NULL AND tax_amount > 0")}
    `);

    const vatSummary = {
      orders_with_vat: parseInt(vatResult.rows[0].orders_with_vat),
      total_vat_collected: parseFloat(vatResult.rows[0].total_vat_collected),
      revenue_inc_vat: parseFloat(vatResult.rows[0].revenue_inc_vat),
      revenue_exc_vat: parseFloat(vatResult.rows[0].revenue_exc_vat),
    };

    res.json({
      period: period || `${from_date} to ${to_date}`,
      revenue_basis: 'delivered_service_value_excluding_vat_less_refunds',
      revenue: {
        total: netRevenue, // UI + exports expect revenue.total
        gross_payments: totalPayments,
        refunds: totalRefunds,
        net_revenue: netRevenue,
        order_count: parseInt(revenueResult.rows[0].total_orders),
        refund_count: parseInt(cashActivityResult.rows[0].refund_count),
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
    // 2. Accounts Receivable (outstanding customer balances)
    const accountsReceivableResult = await query(`
      SELECT COALESCE(SUM(
        GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))
      ), 0) as accounts_receivable
      FROM orders
      WHERE status = 'delivered'
        AND payment_status IN ('UNPAID', 'PARTIAL')
        AND delivered_at < ($1::date + INTERVAL '1 day')
    `, [as_of_date]);

    // 3. Inventory value (current stock)
    const inventoryResult = await query(`
      SELECT COALESCE(SUM(quantity * unit_cost), 0) as inventory_value
      FROM inventory_items
    `);

    // LIABILITIES
    // 1. Accounts Payable (pending/unpaid expenses)
    const accountsPayableResult = await query(`
      SELECT COALESCE(SUM(amount), 0) as accounts_payable
      FROM expenses
      WHERE COALESCE(status, approval_status) IN ('PENDING', 'APPROVED')
        AND expense_date <= $1
    `, [as_of_date]);

    const totalAssets =
      parseFloat(accountsReceivableResult.rows[0].accounts_receivable) +
      parseFloat(inventoryResult.rows[0].inventory_value);

    // Unpaid payroll accrual cannot be derived reliably from the current payroll
    // tables because they store payments but not an accrued-by-date ledger.
    const totalLiabilities = Number(accountsPayableResult.rows[0].accounts_payable) || 0;

    const customerAdvancesResult = await query(`
      SELECT COALESCE(SUM(GREATEST(0, COALESCE(o.amount_paid, 0))), 0) AS customer_advances
      FROM orders o
      WHERE o.status NOT IN ('delivered', 'cancelled')
        AND o.created_at < ($1::date + INTERVAL '1 day')
    `, [as_of_date]);
    const customerAdvances = Number(customerAdvancesResult.rows[0].customer_advances) || 0;
    const liabilitiesWithAdvances = totalLiabilities + customerAdvances;

    const totalEquity = totalAssets - liabilitiesWithAdvances;

    res.json({
      as_of_date,
      equity_basis: 'derived_residual',
      note: 'Partial operational snapshot: opening cash, unpaid payroll, owner capital, and opening balances are not tracked; approved expenses are treated as paid on their expense date, with no separate settlement ledger. Inventory is current rather than historical. Equity is a derived residual, not a posted ledger balance.',
      assets: {
        current_assets: {
          cash: null,
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
          accrued_salaries: null,
          customer_advances: customerAdvances,
          total: liabilitiesWithAdvances,
        },
        long_term_liabilities: {
          loans: 0, // TODO: Add loan tracking
          total: 0,
        },
          total_liabilities: liabilitiesWithAdvances,
      },
      equity: {
        retained_earnings: totalEquity,
        total_equity: totalEquity,
      },
      balance_check: {
        assets: totalAssets,
        liabilities_plus_equity: liabilitiesWithAdvances + totalEquity,
        balanced: Math.abs(totalAssets - (liabilitiesWithAdvances + totalEquity)) < 0.01,
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
    const { period = 'all', from_date, to_date, year } = req.query;

    let dateFilter = '';
    const selectedYear = typeof year === 'string' ? Number(year) : NaN;
    const hasSelectedYear = Number.isInteger(selectedYear) && selectedYear >= 2000;
    const yearStart = hasSelectedYear ? `${selectedYear}-01-01` : '';
    const yearEnd = hasSelectedYear ? `${selectedYear + 1}-01-01` : '';

    if (from_date && to_date) {
      const validRange = typeof from_date === 'string'
        && typeof to_date === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(from_date)
        && /^\d{4}-\d{2}-\d{2}$/.test(to_date)
        && from_date <= to_date;
      if (!validRange) {
        return res.status(400).json({ error: 'Valid from_date and to_date are required' });
      }
      dateFilter = `WHERE created_at >= DATE '${from_date}' AND created_at < DATE '${to_date}' + INTERVAL '1 day'`;
    } else {
      switch (period) {
        case 'all':
          dateFilter = '';
          break;
        case 'month':
          dateFilter = "WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)";
          break;
        case 'year':
          dateFilter = yearStart && yearEnd
            ? `WHERE created_at >= '${yearStart}' AND created_at < '${yearEnd}'`
            : "WHERE DATE_TRUNC('year', created_at) = DATE_TRUNC('year', CURRENT_DATE)";
          break;
        default:
          dateFilter = '';
      }
    }

    const appendFilter = (baseFilter: string, clause: string) => {
      if (!baseFilter) return `WHERE ${clause}`;
      return `${baseFilter}\n        AND ${clause}`;
    };

    // Operating Activities
    const paymentDateFilter = dateFilter
      .replace(/created_at/g, 'p.payment_date')
      .replace(/WHERE p\.payment_date <=/g, 'WHERE p.payment_date <=');
    const cashFromCustomersResult = await query(`
      SELECT COALESCE(SUM(p.amount), 0) AS cash_from_customers
      FROM payments p JOIN orders o ON o.id = p.order_id
      ${appendFilter(paymentDateFilter, 'COALESCE(p.is_cancelled, FALSE) = FALSE')}
    `);

    const cashForExpensesResult = await query(`
      SELECT COALESCE(SUM(amount), 0) as cash_for_expenses
      FROM expenses
      ${appendFilter(dateFilter.replace('created_at', 'expense_date'), "COALESCE(status, approval_status) = 'APPROVED' AND COALESCE(category, '') <> 'Salaries'")}
    `);

    const cashForSalariesResult = await query(`
      SELECT COALESCE(SUM(net_amount), 0) as cash_for_salaries
      FROM salary_payments
      ${appendFilter(dateFilter.replace('created_at', 'payment_date'), "payment_status = 'PAID'")}
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
      cash_at_beginning: null,
      cash_at_end: null,
      cash_balance_available: false,
      note: 'This report shows period cash movements. Approved expenses are treated as paid on their expense date. Opening cash balances are not recorded, so an ending cash balance cannot be calculated reliably.',
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

    // Revenue (Credit), recognized on delivery.
    const revenueResult = await query(`
      SELECT COALESCE(SUM(total_amount - COALESCE(tax_amount, 0)), 0) as balance
      FROM orders
      WHERE status = 'delivered' AND delivered_at IS NOT NULL AND delivered_at < ($1::date + INTERVAL '1 day')
    `, [as_of_date]);

    // Expenses (Debit)
    const expensesResult = await query(`
      SELECT 
        category,
        COALESCE(SUM(amount), 0) as balance
      FROM expenses
      WHERE expense_date <= $1
        AND COALESCE(status, approval_status) = 'APPROVED'
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
      SELECT COALESCE(SUM(p.amount), 0) as balance
      FROM payments p
      WHERE COALESCE(p.is_cancelled, FALSE) = FALSE
        AND p.payment_date < ($1::date + INTERVAL '1 day')
    `, [as_of_date]);

    // Accounts Receivable (Debit)
    const arResult = await query(`
      SELECT COALESCE(SUM(
        GREATEST(0, COALESCE(total_amount, total, 0) - COALESCE(amount_paid, 0))
      ), 0) as balance
      FROM orders
      WHERE status = 'delivered'
        AND payment_status IN ('UNPAID', 'PARTIAL')
        AND delivered_at < ($1::date + INTERVAL '1 day')
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
      accounting_basis: 'operational_subledger_summary',
      note: 'This is a reconstructed summary, not a complete double-entry trial balance. Opening balances, owner capital, and expense settlement entries are not fully recorded.',
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
        o.delivered_at AS created_at,
        CURRENT_DATE - DATE(o.delivered_at) as days_outstanding,
        CASE 
          WHEN CURRENT_DATE - DATE(o.delivered_at) <= 30 THEN '0-30 days'
          WHEN CURRENT_DATE - DATE(o.delivered_at) <= 60 THEN '31-60 days'
          WHEN CURRENT_DATE - DATE(o.delivered_at) <= 90 THEN '61-90 days'
          ELSE '90+ days'
        END as aging_bucket
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.status = 'delivered'
        AND o.delivered_at IS NOT NULL
        AND o.payment_status IN ('UNPAID', 'PARTIAL')
        AND GREATEST(0, COALESCE(o.total_amount, o.total, 0) - COALESCE(o.amount_paid, 0)) > 0
      ORDER BY o.delivered_at ASC
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
        dateFilter = "WHERE DATE_TRUNC('month', delivered_at) = DATE_TRUNC('month', CURRENT_DATE)";
        break;
      case 'year':
        dateFilter = "WHERE DATE_TRUNC('year', delivered_at) = DATE_TRUNC('year', CURRENT_DATE)";
        break;
      default:
        dateFilter = '';
    }

    const appendFilter = (baseFilter: string, clause: string) => {
      if (!baseFilter) return `WHERE ${clause}`;
      return `${baseFilter}\n        AND ${clause}`;
    };

    // Get income statement data
    const revenueResult = await query(`SELECT COALESCE(SUM(total_amount - COALESCE(tax_amount, 0)), 0) as revenue FROM orders ${dateFilter ? `${dateFilter} AND` : 'WHERE'} status = 'delivered' AND delivered_at IS NOT NULL`);
    const expensesResult = await query(`SELECT COALESCE(SUM(amount), 0) as expenses FROM expenses ${appendFilter(dateFilter.replace('delivered_at', 'expense_date'), "COALESCE(status, approval_status) = 'APPROVED' AND COALESCE(category, '') <> 'Salaries'")}`);
    const salariesResult = await query(`SELECT COALESCE(SUM(net_amount), 0) as salaries FROM salary_payments ${appendFilter(dateFilter.replace('delivered_at', 'payment_date'), "payment_status = 'PAID'")}`);

    // Get balance sheet data
    const assetsResult = await query(`
      SELECT
        (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
         WHERE COALESCE(p.is_cancelled, FALSE) = FALSE) +
        (SELECT COALESCE(SUM(GREATEST(0, COALESCE(o.total_amount, o.total, 0) - COALESCE(o.amount_paid, 0))), 0)
         FROM orders o WHERE o.status = 'delivered' AND o.payment_status IN ('UNPAID', 'PARTIAL')) AS assets
    `);
    const liabilitiesResult = await query(`SELECT COALESCE(SUM(amount), 0) as liabilities FROM expenses WHERE COALESCE(status, approval_status) IN ('PENDING', 'APPROVED')`);

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

/**
 * Per-branch P&L snapshot for the same period as the income statement.
 * Company-wide statements stay on the other endpoints; this is the breakdown.
 */
export const getBranchSummary = async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'all', year } = req.query;
    const selectedYear = typeof year === 'string' ? Number(year) : NaN;
    const hasSelectedYear = Number.isInteger(selectedYear) && selectedYear >= 2000;
    const yearStart = hasSelectedYear ? `${selectedYear}-01-01` : '';
    const yearEnd = hasSelectedYear ? `${selectedYear + 1}-01-01` : '';

    let paymentDateSql = 'TRUE';
    let expenseDateSql = 'TRUE';
    let orderDateSql = 'TRUE';

    switch (period) {
      case 'today':
        paymentDateSql = "DATE(p.payment_date) = CURRENT_DATE";
        expenseDateSql = "DATE(e.expense_date) = CURRENT_DATE";
        orderDateSql = "DATE(o.delivered_at) = CURRENT_DATE";
        break;
      case 'week':
        paymentDateSql = "p.payment_date >= CURRENT_DATE - INTERVAL '7 days'";
        expenseDateSql = "e.expense_date >= CURRENT_DATE - INTERVAL '7 days'";
        orderDateSql = "o.delivered_at >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case 'month':
        paymentDateSql = "DATE_TRUNC('month', p.payment_date) = DATE_TRUNC('month', CURRENT_DATE)";
        expenseDateSql = "DATE_TRUNC('month', e.expense_date) = DATE_TRUNC('month', CURRENT_DATE)";
        orderDateSql = "DATE_TRUNC('month', o.delivered_at) = DATE_TRUNC('month', CURRENT_DATE)";
        break;
      case 'year':
        if (yearStart && yearEnd) {
          paymentDateSql = `p.payment_date >= '${yearStart}' AND p.payment_date < '${yearEnd}'`;
          expenseDateSql = `e.expense_date >= '${yearStart}' AND e.expense_date < '${yearEnd}'`;
          orderDateSql = `o.delivered_at >= '${yearStart}' AND o.delivered_at < '${yearEnd}'`;
        } else {
          paymentDateSql = "DATE_TRUNC('year', p.payment_date) = DATE_TRUNC('year', CURRENT_DATE)";
          expenseDateSql = "DATE_TRUNC('year', e.expense_date) = DATE_TRUNC('year', CURRENT_DATE)";
          orderDateSql = "DATE_TRUNC('year', o.delivered_at) = DATE_TRUNC('year', CURRENT_DATE)";
        }
        break;
      default:
        break;
    }

    const result = await query(`
      SELECT
        b.id AS branch_id,
        b.name AS branch_name,
        b.code AS branch_code,
        COALESCE((
          SELECT SUM(o.total_amount - COALESCE(o.tax_amount, 0))
          FROM orders o
          WHERE o.branch_id = b.id AND o.status = 'delivered'
            AND o.delivered_at IS NOT NULL AND ${orderDateSql}
        ), 0) - COALESCE((
          SELECT SUM(ABS(p.amount) * ((o.total_amount - COALESCE(o.tax_amount, 0)) / NULLIF(o.total_amount, 0)))
          FROM payments p JOIN orders o ON o.id = p.order_id
          WHERE o.branch_id = b.id AND o.status = 'delivered'
            AND COALESCE(p.is_cancelled, FALSE) = FALSE
            AND COALESCE(p.is_refund, FALSE) = TRUE
            AND ${paymentDateSql}
        ), 0) AS revenue,
        COALESCE((
          SELECT SUM(e.amount)
          FROM expenses e
          WHERE e.branch_id = b.id
            AND COALESCE(e.status, e.approval_status) = 'APPROVED'
            AND COALESCE(e.category, '') <> 'Salaries'
            AND ${expenseDateSql}
        ), 0) AS expenses,
        COALESCE((
          SELECT SUM(sp.net_amount)
          FROM salary_payments sp JOIN payroll_employees pe ON pe.id = sp.employee_id
          WHERE pe.branch_id = b.id AND sp.payment_status = 'PAID'
            AND ${paymentDateSql.replace(/p\.payment_date/g, 'sp.payment_date')}
        ), 0) AS salaries,
        COALESCE((
          SELECT COUNT(*)
          FROM orders o
          WHERE o.branch_id = b.id
            AND o.status = 'delivered' AND o.delivered_at IS NOT NULL
            AND ${orderDateSql}
        ), 0) AS order_count
      FROM branches b
      ORDER BY b.name ASC
    `);

    const branches = result.rows.map((row: any) => {
      const revenue = parseFloat(row.revenue) || 0;
      const expenses = parseFloat(row.expenses) || 0;
      const salaries = parseFloat(row.salaries) || 0;
      return {
        branch_id: row.branch_id,
        branch_name: row.branch_name,
        branch_code: row.branch_code,
        revenue,
        expenses,
        salaries,
        net_profit: revenue - expenses - salaries,
        order_count: parseInt(row.order_count, 10) || 0,
      };
    });

    res.json({
      period,
      overall: {
        revenue: branches.reduce((s: number, b: any) => s + b.revenue, 0),
        expenses: branches.reduce((s: number, b: any) => s + b.expenses, 0),
        salaries: branches.reduce((s: number, b: any) => s + b.salaries, 0),
        net_profit: branches.reduce((s: number, b: any) => s + b.net_profit, 0),
        order_count: branches.reduce((s: number, b: any) => s + b.order_count, 0),
      },
      branches,
    });
  } catch (error) {
    console.error('Branch summary error:', error);
    res.status(500).json({ error: 'Failed to fetch branch accounting summary' });
  }
};

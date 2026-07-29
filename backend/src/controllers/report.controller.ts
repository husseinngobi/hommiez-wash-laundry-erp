import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { getSystemAdminEmails } from '../utils/systemAdmin';

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    // Today's stats - orders created today
    const todayOrders = await query(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    
    // Today's revenue - money actually RECEIVED today (cash flow)
    const todayRevenue = await query(`
      SELECT COALESCE(SUM(amount), 0) as revenue
      FROM payments
      WHERE DATE(payment_date) = CURRENT_DATE
    `);
    
    // Orders by status today
    const statusCounts = await query(`
      SELECT status, COUNT(*) as count
      FROM orders
      WHERE DATE(created_at) = CURRENT_DATE
      GROUP BY status
    `);
    
    // Total customers
    const totalCustomers = await query('SELECT COUNT(*) as count FROM customers');
    
    // New customers this week
    const newCustomers = await query(`
      SELECT COUNT(*) as count FROM customers
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    `);
    
    // Average order value - based on actual payments received (last 30 days)
    const avgOrderValue = await query(`
      SELECT AVG(amount) as avg_value
      FROM payments
      WHERE payment_date >= CURRENT_DATE - INTERVAL '30 days'
    `);
    
    // Recent orders
    const recentOrders = await query(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ORDER BY o.created_at DESC
      LIMIT 5
    `);
    
    res.json({
      today: {
        orders: parseInt(todayOrders.rows[0].count),
        revenue: parseInt(todayRevenue.rows[0].revenue),
      },
      status_counts: statusCounts.rows,
      customers: {
        total: parseInt(totalCustomers.rows[0].count),
        new_this_week: parseInt(newCustomers.rows[0].count),
      },
      avg_order_value: Math.round(parseFloat(avgOrderValue.rows[0].avg_value || '0')),
      recent_orders: recentOrders.rows,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};

export const getRevenueReport = async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'week' } = req.query;
    
    let dateFilter = '';
    if (period === 'day') {
      dateFilter = "DATE(payment_date) = CURRENT_DATE";
    } else if (period === 'week') {
      dateFilter = "payment_date >= CURRENT_DATE - INTERVAL '7 days'";
    } else if (period === 'month') {
      dateFilter = "payment_date >= CURRENT_DATE - INTERVAL '30 days'";
    } else if (period === 'year') {
      dateFilter = "EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)";
    } else if (period === 'all') {
      dateFilter = "1=1"; // All time - no date restriction
    } else if (/^\d{4}$/.test(period as string)) {
      // Specific year (e.g., '2021', '2022', '2023', '2024', '2025')
      dateFilter = `EXTRACT(YEAR FROM payment_date) = ${period}`;
    } else {
      dateFilter = "1=1"; // Default to all time if period not recognized
    }
    
    // Daily revenue - based on actual payment receipts (when money was received)
    const dailyRevenue = await query(`
      SELECT 
        DATE(p.payment_date) as date,
        COUNT(DISTINCT p.order_id) as order_count,
        SUM(p.amount) as revenue,
        AVG(p.amount) as avg_order_value
      FROM payments p
      WHERE ${dateFilter}
      GROUP BY DATE(p.payment_date)
      ORDER BY date DESC
    `);
    
    // Revenue by category - based on when payments were received
    const categoryRevenue = await query(`
      SELECT 
        pi.category as category,
        COUNT(DISTINCT pay.order_id) as order_count,
        SUM(pay.amount) as revenue
      FROM payments pay
      JOIN orders o ON pay.order_id = o.id
      JOIN order_items oi ON o.id = oi.order_id
      JOIN price_items pi ON oi.price_item_id = pi.id
      WHERE ${dateFilter.replace('payment_date', 'pay.payment_date')}
        AND pi.category IS NOT NULL
      GROUP BY pi.category
      HAVING SUM(pay.amount) > 0
      ORDER BY revenue DESC
    `);
    
    // Top customers - based on actual money RECEIVED in this period (payment date)
    const topCustomers = await query(`
      SELECT 
        c.id,
        c.name,
        c.phone,
        COUNT(DISTINCT p.order_id) as order_count,
        SUM(p.amount) as total_spent
      FROM customers c
      JOIN payments p ON c.id = p.customer_id
      WHERE ${dateFilter.replace('payment_date', 'p.payment_date')}
      GROUP BY c.id, c.name, c.phone
      HAVING SUM(p.amount) > 0
      ORDER BY total_spent DESC
      LIMIT 10
    `);
    
    // Total summary - based on actual payments RECEIVED in this period (payment date)
    const summary = await query(`
      SELECT 
        COUNT(DISTINCT order_id) as total_orders,
        COALESCE(SUM(amount), 0) as total_revenue,
        COALESCE(AVG(amount), 0) as avg_order_value,
        COALESCE(SUM(CASE WHEN o.discount IS NOT NULL THEN o.discount ELSE 0 END), 0) as total_discounts
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      WHERE ${dateFilter.replace('payment_date', 'p.payment_date')}
    `);

    // Order status distribution - operational view (orders CREATED in period)
    const statusDistribution = await query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM orders
      WHERE ${dateFilter.replace('payment_date', 'created_at')}
      GROUP BY status
      ORDER BY count DESC
    `);
    
    res.json({
      period,
      summary: summary.rows[0],
      daily_revenue: dailyRevenue.rows,
      category_revenue: categoryRevenue.rows,
      top_customers: topCustomers.rows,
      status_distribution: statusDistribution.rows,
    });
  } catch (error) {
    console.error('Revenue report error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue report' });
  }
};

export const getCustomerAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    // Customer segmentation
    const segmentation = await query(`
      SELECT 
        CASE 
          WHEN total_spent >= 1000000 THEN 'VIP'
          WHEN total_spent >= 500000 THEN 'High Value'
          WHEN total_spent >= 100000 THEN 'Regular'
          ELSE 'New'
        END as segment,
        COUNT(*) as customer_count,
        SUM(total_spent) as segment_revenue
      FROM (
        SELECT c.id, COALESCE(SUM(COALESCE(o.total_amount, o.total, 0)), 0) as total_spent
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        GROUP BY c.id
      ) customer_totals
      GROUP BY segment
      ORDER BY segment_revenue DESC
    `);
    
    // Customer retention
    const retention = await query(`
      SELECT 
        COUNT(DISTINCT CASE WHEN order_count = 1 THEN customer_id END) as one_time,
        COUNT(DISTINCT CASE WHEN order_count BETWEEN 2 AND 5 THEN customer_id END) as occasional,
        COUNT(DISTINCT CASE WHEN order_count > 5 THEN customer_id END) as regular
      FROM (
        SELECT customer_id, COUNT(*) as order_count
        FROM orders
        GROUP BY customer_id
      ) customer_orders
    `);
    
    // New vs Returning customers this month
    const customerType = await query(`
      SELECT 
        CASE 
          WHEN first_order_date >= CURRENT_DATE - INTERVAL '30 days' THEN 'New'
          ELSE 'Returning'
        END as customer_type,
        COUNT(*) as count,
        SUM(order_count) as orders,
        SUM(total_spent) as revenue
      FROM (
        SELECT 
          c.id,
          MIN(o.created_at) as first_order_date,
          COUNT(o.id) as order_count,
          SUM(COALESCE(o.total_amount, o.total, 0)) as total_spent
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY c.id
      ) customer_stats
      GROUP BY customer_type
    `);
    
    res.json({
      segmentation: segmentation.rows,
      retention: retention.rows[0],
      customer_type: customerType.rows,
    });
  } catch (error) {
    console.error('Customer analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch customer analytics' });
  }
};

export const downloadPDFReport = async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'week' } = req.query;
    
    let dateFilter = '';
    let periodLabel = 'This Week';
    
    if (period === 'day') {
      dateFilter = "DATE(payment_date) = CURRENT_DATE";
      periodLabel = 'Today';
    } else if (period === 'week') {
      dateFilter = "payment_date >= CURRENT_DATE - INTERVAL '7 days'";
      periodLabel = 'This Week';
    } else if (period === 'month') {
      dateFilter = "payment_date >= CURRENT_DATE - INTERVAL '30 days'";
      periodLabel = 'This Month';
    } else if (period === 'year') {
      dateFilter = "EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)";
      periodLabel = 'This Year';
    } else if (period === 'all') {
      dateFilter = "1=1";
      periodLabel = 'All Time';
    } else if (/^\d{4}$/.test(period as string)) {
      // Specific year (e.g., '2021', '2022', '2023', '2024', '2025')
      dateFilter = `EXTRACT(YEAR FROM payment_date) = ${period}`;
      periodLabel = `Year ${period}`;
    } else {
      dateFilter = "1=1";
      periodLabel = 'All Time';
    }
    
    // Fetch the same data as the revenue report - based on payment receipt date
    const dailyRevenue = await query(`
      SELECT 
        DATE(payment_date) as date,
        COUNT(DISTINCT order_id) as order_count,
        SUM(amount) as revenue,
        AVG(amount) as avg_order_value
      FROM payments
      WHERE ${dateFilter}
      GROUP BY DATE(payment_date)
      ORDER BY date DESC
    `);
    
    const categoryRevenue = await query(`
      SELECT 
        pi.category as category,
        COUNT(DISTINCT pay.order_id) as order_count,
        SUM(pay.amount) as revenue
      FROM payments pay
      JOIN orders o ON pay.order_id = o.id
      JOIN order_items oi ON o.id = oi.order_id
      JOIN price_items pi ON oi.price_item_id = pi.id
      WHERE ${dateFilter.replace('payment_date', 'pay.payment_date')}
        AND pi.category IS NOT NULL
      GROUP BY pi.category
      HAVING SUM(pay.amount) > 0
      ORDER BY revenue DESC
    `);
    
    const topCustomers = await query(`
      SELECT 
        c.name,
        c.phone,
        COUNT(DISTINCT p.order_id) as order_count,
        SUM(p.amount) as total_spent
      FROM customers c
      JOIN payments p ON c.id = p.customer_id
      WHERE ${dateFilter.replace('payment_date', 'p.payment_date')}
      GROUP BY c.id, c.name, c.phone
      ORDER BY total_spent DESC
      LIMIT 10
    `);
    
    const summary = await query(`
      SELECT 
        COUNT(DISTINCT order_id) as total_orders,
        SUM(amount) as total_revenue,
        AVG(amount) as avg_order_value,
        COALESCE(SUM(CASE WHEN o.discount IS NOT NULL THEN o.discount ELSE 0 END), 0) as total_discounts
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      WHERE ${dateFilter.replace('payment_date', 'p.payment_date')}
    `);
    
    // Generate HTML for PDF
    const summaryData = summary.rows[0];
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Lush Laundry Revenue Report</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; }
    h1 { color: #2563eb; text-align: center; }
    h2 { color: #1e40af; margin-top: 30px; border-bottom: 2px solid #93c5fd; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
    th { background: #f1f5f9; }
    .amount { text-align: right; font-family: monospace; }
    .summary-card { display: inline-block; width: 23%; margin: 10px 1%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
    .summary-value { font-size: 24px; font-weight: bold; color: #2563eb; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>LUSH LAUNDRY SERVICES</h1>
  <p style="text-align:center">Revenue & Analytics Report - ${periodLabel}<br/>Generated: ${new Date().toLocaleString()}</p>
  
  <h2>Summary</h2>
  <div>
    <div class="summary-card">
      <div>Total Orders</div>
      <div class="summary-value">${summaryData.total_orders}</div>
    </div>
    <div class="summary-card">
      <div>Total Revenue</div>
      <div class="summary-value">UGX ${parseInt(summaryData.total_revenue || '0').toLocaleString()}</div>
    </div>
    <div class="summary-card">
      <div>Avg Order Value</div>
      <div class="summary-value">UGX ${parseInt(summaryData.avg_order_value || '0').toLocaleString()}</div>
    </div>
    <div class="summary-card">
      <div>Total Discounts</div>
      <div class="summary-value">UGX ${parseInt(summaryData.total_discounts || '0').toLocaleString()}</div>
    </div>
  </div>
  
  <h2>Daily Revenue</h2>
  <table>
    <tr>
      <th>Date</th>
      <th class="amount">Orders</th>
      <th class="amount">Revenue</th>
      <th class="amount">Avg Order Value</th>
    </tr>
    ${dailyRevenue.rows.map(row => `
    <tr>
      <td>${new Date(row.date).toLocaleDateString()}</td>
      <td class="amount">${row.order_count}</td>
      <td class="amount">UGX ${parseInt(row.revenue || '0').toLocaleString()}</td>
      <td class="amount">UGX ${parseInt(row.avg_order_value || '0').toLocaleString()}</td>
    </tr>
    `).join('')}
  </table>
  
  <h2>Revenue by Category</h2>
  <table>
    <tr>
      <th>Category</th>
      <th class="amount">Orders</th>
      <th class="amount">Revenue</th>
    </tr>
    ${categoryRevenue.rows.map(row => `
    <tr>
      <td>${row.category}</td>
      <td class="amount">${row.order_count}</td>
      <td class="amount">UGX ${parseInt(row.revenue || '0').toLocaleString()}</td>
    </tr>
    `).join('')}
  </table>
  
  <h2>Top Customers</h2>
  <table>
    <tr>
      <th>Name</th>
      <th>Phone</th>
      <th class="amount">Orders</th>
      <th class="amount">Total Spent</th>
    </tr>
    ${topCustomers.rows.map(row => `
    <tr>
      <td>${row.name}</td>
      <td>${row.phone}</td>
      <td class="amount">${row.order_count}</td>
      <td class="amount">UGX ${parseInt(row.total_spent || '0').toLocaleString()}</td>
    </tr>
    `).join('')}
  </table>
</body>
</html>`;
    
    // Send HTML as response (browser will render it, user can print to PDF)
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `inline; filename="report_${period}_${new Date().toISOString().split('T')[0]}.html"`);
    res.send(html);
  } catch (error) {
    console.error('PDF report error:', error);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
};

export const getStaffPerformance = async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'week' } = req.query;
    const userRole = req.user?.role;
    const userId = req.user?.id;
    const hiddenSystemAdminEmails = getSystemAdminEmails();
    
    let dateFilter = '';
    if (period === 'today' || period === 'day') {
      dateFilter = "DATE(p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE(NOW() AT TIME ZONE 'Africa/Nairobi')";
    } else if (period === 'week') {
      dateFilter = "p.payment_date >= NOW() - INTERVAL '7 days'";
    } else if (period === 'month') {
      dateFilter = "p.payment_date >= NOW() - INTERVAL '30 days'";
    } else if (period === 'year') {
      dateFilter = "p.payment_date >= NOW() - INTERVAL '365 days'";
    } else if (period === 'all') {
      dateFilter = "1=1"; // All time - no date restriction
    } else {
      dateFilter = "1=1"; // Default to all time if period not recognized
    }

    // Role-based filter: DESKTOP_AGENT sees only their own stats.
    const staffWhereClauses = ["u.role IN ('ADMIN', 'MANAGER', 'DESKTOP_AGENT')"];
    const staffWhereParams: any[] = [];

    if (userRole === 'DESKTOP_AGENT' && userId) {
      staffWhereParams.push(userId);
      staffWhereClauses.push(`u.id = $${staffWhereParams.length}`);
    }

    if (hiddenSystemAdminEmails.length > 0) {
      staffWhereParams.push(hiddenSystemAdminEmails);
      staffWhereClauses.push(`(u.email IS NULL OR LOWER(u.email) != ALL($${staffWhereParams.length}::text[]))`);
    }

    const staffWhereSql = staffWhereClauses.join(' AND ');

    // Staff performance: orders created by each staff member - revenue counted when PAYMENT RECEIVED
    const staffStats = await query(`
      SELECT 
        u.id,
        u.full_name as staff_name,
        u.role,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(p.amount), 0) as total_revenue,
        COALESCE(AVG(p.amount), 0) as avg_order_value,
        COALESCE(SUM(o.discount_amount), 0) as total_discounts_given,
        COALESCE(SUM(o.bargain_amount), 0) as total_bargains_given
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      LEFT JOIN payments p ON o.id = p.order_id ${dateFilter !== '1=1' ? `AND ${dateFilter}` : ''}
      WHERE ${staffWhereSql}
      GROUP BY u.id, u.full_name, u.role
      ORDER BY total_revenue DESC
    `, staffWhereParams);

    const dailyWhereClauses = [dateFilter];
    const dailyWhereParams: any[] = [];

    if (userRole === 'DESKTOP_AGENT' && userId) {
      dailyWhereParams.push(userId);
      dailyWhereClauses.push(`u.id = $${dailyWhereParams.length}`);
    }

    if (hiddenSystemAdminEmails.length > 0) {
      dailyWhereParams.push(hiddenSystemAdminEmails);
      dailyWhereClauses.push(`(u.email IS NULL OR LOWER(u.email) != ALL($${dailyWhereParams.length}::text[]))`);
    }

    const dailyWhereSql = dailyWhereClauses.join(' AND ');

    // Daily breakdown for visualization - revenue counted by PAYMENT RECEIPT DATE
    const dailyStaffPerformance = await query(`
      SELECT 
        DATE(p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') as date,
        u.full_name as staff_name,
        COUNT(DISTINCT p.order_id) as order_count,
        COALESCE(SUM(p.amount), 0) as revenue
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      JOIN users u ON o.user_id = u.id
      WHERE ${dailyWhereSql}
      GROUP BY DATE(p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi'), u.full_name
      ORDER BY date DESC, revenue DESC
    `, dailyWhereParams);

    res.json({
      staff_stats: staffStats.rows,
      daily_staff_performance: dailyStaffPerformance.rows,
    });
  } catch (error) {
    console.error('Staff performance error:', error);
    res.status(500).json({ error: 'Failed to fetch staff performance data' });
  }
};

export const getVATSummary = async (req: AuthRequest, res: Response) => {
  try {
    const { period = 'week' } = req.query;
    
    let dateFilter = '';
    if (period === 'day') {
      dateFilter = "DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE(NOW() AT TIME ZONE 'Africa/Nairobi')";
    } else if (period === 'week') {
      dateFilter = "created_at >= NOW() - INTERVAL '7 days'";
    } else if (period === 'month') {
      dateFilter = "created_at >= NOW() - INTERVAL '30 days'";
    } else if (period === 'year') {
      dateFilter = "created_at >= NOW() - INTERVAL '365 days'";
    } else if (period === 'all') {
      dateFilter = "1=1";
    } else {
      dateFilter = "1=1";
    }

    // Total VAT collected (only from orders with tax_amount > 0)
    const vatSummary = await query(`
      SELECT 
        COUNT(*) as total_orders_with_vat,
        SUM(tax_amount) as total_vat_collected,
        AVG(tax_rate) as avg_vat_rate,
        SUM(total_amount) as total_revenue_inc_vat,
        SUM(total_amount - tax_amount) as total_revenue_exc_vat
      FROM orders
      WHERE ${dateFilter}
        AND tax_amount > 0
    `);

    // Orders without VAT
    const noVatOrders = await query(`
      SELECT COUNT(*) as total_orders_without_vat
      FROM orders
      WHERE ${dateFilter}
        AND (tax_amount = 0 OR tax_amount IS NULL)
    `);

    // VAT breakdown by day
    const dailyVat = await query(`
      SELECT 
        DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') as date,
        COUNT(*) as orders_with_vat,
        SUM(tax_amount) as vat_collected,
        SUM(total_amount) as total_inc_vat
      FROM orders
      WHERE ${dateFilter}
        AND tax_amount > 0
      GROUP BY DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi')
      ORDER BY date DESC
      LIMIT 30
    `);

    // Monthly VAT breakdown (for URA monthly filing compliance)
    const monthlyVat = await query(`
      SELECT 
        TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM') as month,
        TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi', 'Month YYYY') as month_name,
        COUNT(*) as orders_with_vat,
        SUM(tax_amount) as vat_collected,
        SUM(total_amount) as total_inc_vat,
        SUM(total_amount - tax_amount) as total_exc_vat
      FROM orders
      WHERE ${dateFilter}
        AND tax_amount > 0
      GROUP BY TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM'),
               TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi', 'Month YYYY')
      ORDER BY month DESC
      LIMIT 24
    `);

    // Staff who applied VAT (for tracking)
    const staffVatUsage = await query(`
      SELECT 
        u.id,
        u.full_name as staff_name,
        u.role,
        COUNT(o.id) as orders_with_vat_applied,
        SUM(o.tax_amount) as total_vat_collected
      FROM users u
      JOIN orders o ON u.id = o.user_id
      WHERE ${dateFilter.replace(/created_at/g, 'o.created_at')}
        AND o.tax_amount > 0
      GROUP BY u.id, u.full_name, u.role
      ORDER BY total_vat_collected DESC
    `);

    res.json({
      summary: vatSummary.rows[0] || {
        total_orders_with_vat: 0,
        total_vat_collected: 0,
        avg_vat_rate: 0,
        total_revenue_inc_vat: 0,
        total_revenue_exc_vat: 0
      },
      orders_without_vat: noVatOrders.rows[0]?.total_orders_without_vat || 0,
      daily_vat: dailyVat.rows,
      monthly_vat: monthlyVat.rows,
      staff_vat_usage: staffVatUsage.rows,
    });
  } catch (error) {
    console.error('VAT summary error:', error);
    res.status(500).json({ error: 'Failed to fetch VAT summary' });
  }
};


const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function dashboardOverview() {
  try {
    console.log('=== COMPLETE DASHBOARD OVERVIEW ===\n');
    
    // Order Status
    const statusResult = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM orders))::numeric, 1) as percentage
      FROM orders
      GROUP BY status
      ORDER BY 
        CASE status
          WHEN 'pending' THEN 1
          WHEN 'processing' THEN 2
          WHEN 'ready' THEN 3
          WHEN 'delivered' THEN 4
          WHEN 'cancelled' THEN 5
        END
    `);
    
    console.log('ORDER STATUS:');
    let totalOrders = 0;
    statusResult.rows.forEach(row => {
      console.log(`  ${row.status.toUpperCase()}: ${row.count} orders (${row.percentage}%)`);
      totalOrders += parseInt(row.count);
    });
    console.log(`  TOTAL: ${totalOrders} orders\n`);
    
    // Payment Status
    const paymentResult = await pool.query(`
      SELECT 
        payment_status,
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(amount_paid), 0) as amount_paid,
        COALESCE(SUM(balance), 0) as balance
      FROM orders
      GROUP BY payment_status
      ORDER BY 
        CASE payment_status
          WHEN 'PAID' THEN 1
          WHEN 'PARTIAL' THEN 2
          WHEN 'UNPAID' THEN 3
        END
    `);
    
    console.log('PAYMENT STATUS:');
    paymentResult.rows.forEach(row => {
      console.log(`  ${row.payment_status}:`);
      console.log(`    Orders: ${row.count}`);
      console.log(`    Total Amount: UGX ${parseFloat(row.total_amount).toLocaleString()}`);
      console.log(`    Amount Paid: UGX ${parseFloat(row.amount_paid).toLocaleString()}`);
      console.log(`    Balance: UGX ${parseFloat(row.balance).toLocaleString()}`);
    });
    console.log('');
    
    // Today's stats
    const todayStats = await pool.query(`
      SELECT 
        COUNT(*) as today_orders,
        COALESCE(SUM(total_amount), 0) as today_total
      FROM orders
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    
    const todayPayments = await pool.query(`
      SELECT 
        COUNT(*) as payment_count,
        COALESCE(SUM(amount), 0) as total_received
      FROM payments
      WHERE DATE(payment_date) = CURRENT_DATE
    `);
    
    console.log('TODAY\'S ACTIVITY:');
    console.log(`  New Orders: ${todayStats.rows[0].today_orders}`);
    console.log(`  Order Value: UGX ${parseFloat(todayStats.rows[0].today_total).toLocaleString()}`);
    console.log(`  Payments Received: ${todayPayments.rows[0].payment_count} payments`);
    console.log(`  Cash Collected: UGX ${parseFloat(todayPayments.rows[0].total_received).toLocaleString()}\n`);
    
    // Active customers
    const activeCustomers = await pool.query(`
      SELECT COUNT(DISTINCT customer_id) as count
      FROM orders
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    `);
    
    console.log('ACTIVE CUSTOMERS (Last 30 days): ' + activeCustomers.rows[0].count);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

dashboardOverview();

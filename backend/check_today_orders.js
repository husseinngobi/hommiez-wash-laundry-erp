const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkTodayOrders() {
  try {
    console.log('=== CHECKING TODAY\'S ORDERS ===\n');
    
    // Check current database date/time
    const dateCheck = await pool.query(`SELECT NOW() as db_time, CURRENT_DATE as db_date`);
    console.log('Database Time:', dateCheck.rows[0].db_time);
    console.log('Database Date:', dateCheck.rows[0].db_date);
    console.log('');
    
    // Orders created today
    const todayOrders = await pool.query(`
      SELECT COUNT(*) as count 
      FROM orders 
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    console.log('Orders with DATE(created_at) = CURRENT_DATE:', todayOrders.rows[0].count);
    console.log('');
    
    // Recent orders with timestamps
    const recentOrders = await pool.query(`
      SELECT 
        order_number,
        created_at,
        DATE(created_at) as order_date,
        CURRENT_DATE as today,
        status,
        total_amount
      FROM orders 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    console.log('MOST RECENT 10 ORDERS:');
    recentOrders.rows.forEach(order => {
      const isToday = order.order_date.toISOString().split('T')[0] === order.today.toISOString().split('T')[0];
      console.log(`${order.order_number}: ${order.created_at} ${isToday ? '✓ TODAY' : ''}`);
      console.log(`  Status: ${order.status}, Amount: ${order.total_amount}`);
    });
    console.log('');
    
    // Payments made today
    const todayPayments = await pool.query(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM payments 
      WHERE DATE(payment_date) = CURRENT_DATE
    `);
    console.log('PAYMENTS TODAY:', todayPayments.rows[0].count, 'payments');
    console.log('TOTAL COLLECTED:', todayPayments.rows[0].total);
    console.log('');
    
    // Recent payments
    const recentPayments = await pool.query(`
      SELECT 
        p.id,
        p.order_id,
        o.order_number,
        p.amount,
        p.payment_date,
        DATE(p.payment_date) as payment_date_only
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      ORDER BY p.payment_date DESC 
      LIMIT 10
    `);
    
    console.log('MOST RECENT 10 PAYMENTS:');
    recentPayments.rows.forEach(payment => {
      console.log(`Payment #${payment.id} for ${payment.order_number}: UGX ${payment.amount}`);
      console.log(`  Date: ${payment.payment_date}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkTodayOrders();

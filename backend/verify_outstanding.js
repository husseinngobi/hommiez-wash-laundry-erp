const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function verifyOutstanding() {
  try {
    // Total outstanding balances
    const totalResult = await pool.query(`
      SELECT 
        COALESCE(SUM(balance), 0) as total_outstanding, 
        COUNT(*) as order_count
      FROM orders 
      WHERE payment_status IN ('UNPAID', 'PARTIAL')
    `);
    
    console.log('=== OUTSTANDING RECEIVABLES VERIFICATION ===');
    console.log('Total Outstanding:', totalResult.rows[0].total_outstanding);
    console.log('Number of Orders:', totalResult.rows[0].order_count);
    console.log('');
    
    // Breakdown by payment status
    const breakdownResult = await pool.query(`
      SELECT 
        payment_status,
        COUNT(*) as count,
        COALESCE(SUM(balance), 0) as total_balance,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(amount_paid), 0) as total_paid
      FROM orders 
      WHERE payment_status IN ('UNPAID', 'PARTIAL')
      GROUP BY payment_status
    `);
    
    console.log('=== BREAKDOWN BY STATUS ===');
    breakdownResult.rows.forEach(row => {
      console.log(`${row.payment_status}:`);
      console.log(`  Orders: ${row.count}`);
      console.log(`  Total Amount: ${row.total_amount}`);
      console.log(`  Amount Paid: ${row.total_paid}`);
      console.log(`  Balance: ${row.total_balance}`);
      console.log('');
    });
    
    // Sample of orders with highest balances
    const samplesResult = await pool.query(`
      SELECT 
        order_number,
        payment_status,
        total_amount,
        amount_paid,
        balance,
        created_at
      FROM orders 
      WHERE payment_status IN ('UNPAID', 'PARTIAL')
      ORDER BY balance DESC
      LIMIT 10
    `);
    
    console.log('=== TOP 10 ORDERS BY BALANCE ===');
    samplesResult.rows.forEach(order => {
      console.log(`${order.order_number}: UGX ${order.balance} (${order.payment_status})`);
      console.log(`  Total: ${order.total_amount}, Paid: ${order.amount_paid}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

verifyOutstanding();

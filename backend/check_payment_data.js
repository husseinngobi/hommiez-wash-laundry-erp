const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkPaymentData() {
  try {
    console.log('🔍 Checking payment assignment data...\n');
    
    // 1. Check pending payments
    console.log('1️⃣ Pending Payments:');
    const pending = await pool.query(`
      SELECT id, status, amount, sender_phone, assigned_to_order_id, assigned_at
      FROM pending_payments
      ORDER BY id DESC
      LIMIT 10;
    `);
    console.table(pending.rows);
    
    // 2. Check recent payments in payments table
    console.log('\n2️⃣ Recent Payment Records:');
    const payments = await pool.query(`
      SELECT p.id, p.order_id, p.amount, p.payment_method, p.created_at, o.order_number
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      ORDER BY p.id DESC
      LIMIT 10;
    `);
    console.table(payments.rows);
    
    // 3. Check if any payment was assigned but then reverted
    console.log('\n3️⃣ Assigned Pending Payments:');
    const assigned = await pool.query(`
      SELECT id, status, amount, assigned_to_order_id, assigned_at, assigned_by
      FROM pending_payments
      WHERE status = 'ASSIGNED'
      ORDER BY assigned_at DESC
      LIMIT 10;
    `);
    console.table(assigned.rows);
    
    // 4. Check orders with recent payment updates
    console.log('\n4️⃣ Recently Updated Orders:');
    const orders = await pool.query(`
      SELECT id, order_number, total_amount, amount_paid, balance, payment_status, updated_at
      FROM orders
      ORDER BY updated_at DESC
      LIMIT 10;
    `);
    console.table(orders.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkPaymentData();

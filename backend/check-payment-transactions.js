const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkPaymentTransactions() {
  try {
    console.log('\n💰 PAYMENT TRANSACTIONS ANALYSIS\n');
    console.log('='.repeat(80));
    
    // Check if payments table exists
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('payments', 'pending_payments')
      ORDER BY table_name
    `);
    
    console.log('\n📋 Payment Tables in Database:');
    console.table(tablesCheck.rows);
    
    if (tablesCheck.rows.length === 0) {
      console.log('\n⚠️  No payment tables found!');
      await pool.end();
      return;
    }
    
    // Check payments table structure
    const paymentsColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'payments'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📊 Payments Table Structure:');
    console.table(paymentsColumns.rows);
    
    // Check payment records
    const paymentsCount = await pool.query(`
      SELECT 
        COUNT(*) as total_payments,
        COUNT(DISTINCT order_id) as orders_with_payments,
        SUM(amount) as total_amount_paid
      FROM payments
    `);
    
    console.log('\n💵 Payment Records Summary:');
    console.table(paymentsCount.rows);
    
    // Check orders vs payments relationship
    const ordersPaymentsRelation = await pool.query(`
      SELECT 
        o.payment_status,
        COUNT(DISTINCT o.id) as order_count,
        COUNT(DISTINCT p.id) as payment_count,
        SUM(o.total_amount) as total_order_amount,
        SUM(o.amount_paid) as total_amount_paid,
        SUM(o.balance) as total_balance
      FROM orders o
      LEFT JOIN payments p ON o.id = p.order_id
      GROUP BY o.payment_status
      ORDER BY order_count DESC
    `);
    
    console.log('\n📈 Orders vs Payments Relationship:');
    console.table(ordersPaymentsRelation.rows);
    
    // Check for orders with payments
    const ordersWithPayments = await pool.query(`
      SELECT 
        o.order_number,
        o.payment_status,
        o.total_amount,
        o.amount_paid,
        o.balance,
        COUNT(p.id) as payment_transactions,
        COALESCE(SUM(p.amount), 0) as payments_sum
      FROM orders o
      LEFT JOIN payments p ON o.id = p.order_id
      WHERE o.payment_status IN ('PAID', 'PARTIAL')
      GROUP BY o.id, o.order_number, o.payment_status, o.total_amount, o.amount_paid, o.balance
      ORDER BY o.created_at DESC
      LIMIT 10
    `);
    
    console.log('\n💳 Sample Orders with Payments:');
    console.table(ordersWithPayments.rows);
    
    // Check payment methods distribution
    const paymentMethods = await pool.query(`
      SELECT 
        payment_method,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM payments
      GROUP BY payment_method
      ORDER BY count DESC
    `);
    
    console.log('\n💰 Payment Methods Distribution:');
    console.table(paymentMethods.rows);
    
    // Check pending payments if table exists
    const hasPendingPayments = tablesCheck.rows.some(row => row.table_name === 'pending_payments');
    
    if (hasPendingPayments) {
      const pendingPaymentsCount = await pool.query(`
        SELECT 
          status,
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM pending_payments
        GROUP BY status
        ORDER BY count DESC
      `);
      
      console.log('\n⏳ Pending Payments:');
      console.table(pendingPaymentsCount.rows);
    }
    
    // Check for discrepancies (orders marked as PAID but no payment records)
    const discrepancies = await pool.query(`
      SELECT 
        o.order_number,
        o.payment_status,
        o.total_amount,
        o.amount_paid,
        o.payment_method,
        COUNT(p.id) as payment_records
      FROM orders o
      LEFT JOIN payments p ON o.id = p.order_id
      WHERE o.payment_status IN ('PAID', 'PARTIAL')
        AND o.amount_paid > 0
      GROUP BY o.id, o.order_number, o.payment_status, o.total_amount, o.amount_paid, o.payment_method
      HAVING COUNT(p.id) = 0
      LIMIT 10
    `);
    
    console.log('\n⚠️  Orders with Payment but No Transaction Records:');
    console.table(discrepancies.rows);
    console.log(`   Total: ${discrepancies.rows.length} orders`);
    
    await pool.end();
    console.log('\n✅ Payment Transactions Analysis Complete!\n');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkPaymentTransactions();

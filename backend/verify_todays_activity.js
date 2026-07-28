const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'lush_laundry',
  password: process.env.DB_PASSWORD,
  port: 5432,
});

async function verifyTodaysActivity() {
  try {
    console.log('=== TODAY\'S ACTIVITY VERIFICATION ===');
    console.log('Date: February 5, 2026 (Africa/Nairobi timezone)\n');

    // 1. Orders CREATED today
    const ordersCreatedToday = await pool.query(`
      SELECT 
        o.id,
        c.name as customer_name,
        o.status,
        o.total_amount,
        o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi' as created_at_eat
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE DATE(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE(NOW() AT TIME ZONE 'Africa/Nairobi')
      ORDER BY o.created_at DESC
    `);

    console.log('📝 ORDERS CREATED TODAY:');
    console.log(`   Count: ${ordersCreatedToday.rows.length}`);
    if (ordersCreatedToday.rows.length > 0) {
      ordersCreatedToday.rows.forEach(order => {
        console.log(`   - Order #${order.id}: ${order.customer_name} (${order.status}) - UGX ${parseFloat(order.total_amount).toLocaleString()}`);
        console.log(`     Created: ${order.created_at_eat}`);
      });
    } else {
      console.log('   No orders created today');
    }
    console.log('');

    // 2. Deliveries MADE today (delivered_at = today)
    const deliveriesToday = await pool.query(`
      SELECT 
        id,
        order_id,
        delivery_status,
        delivered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi' as delivered_at_eat,
        scheduled_date
      FROM deliveries
      WHERE DATE(delivered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE(NOW() AT TIME ZONE 'Africa/Nairobi')
      ORDER BY delivered_at DESC
    `);

    console.log('🚚 DELIVERIES COMPLETED TODAY:');
    console.log(`   Count: ${deliveriesToday.rows.length}`);
    if (deliveriesToday.rows.length > 0) {
      deliveriesToday.rows.forEach(delivery => {
        console.log(`   - Delivery #${delivery.id} for Order #${delivery.order_id}`);
        console.log(`     Status: ${delivery.delivery_status}`);
        console.log(`     Delivered: ${delivery.delivered_at_eat}`);
        console.log(`     Scheduled: ${delivery.scheduled_date}`);
      });
    } else {
      console.log('   No deliveries completed today');
    }
    console.log('');

    // 3. Orders DELIVERED today (status changed to delivered)
    const ordersDeliveredToday = await pool.query(`
      SELECT 
        o.id,
        c.name as customer_name,
        o.status,
        o.total_amount,
        o.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi' as updated_at_eat
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.status = 'delivered'
        AND DATE(o.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE(NOW() AT TIME ZONE 'Africa/Nairobi')
      ORDER BY o.updated_at DESC
    `);

    console.log('✅ ORDERS MARKED DELIVERED TODAY:');
    console.log(`   Count: ${ordersDeliveredToday.rows.length}`);
    if (ordersDeliveredToday.rows.length > 0) {
      ordersDeliveredToday.rows.forEach(order => {
        console.log(`   - Order #${order.id}: ${order.customer_name} - UGX ${parseFloat(order.total_amount).toLocaleString()}`);
        console.log(`     Updated: ${order.updated_at_eat}`);
      });
    } else {
      console.log('   No orders marked delivered today');
    }
    console.log('');

    // 4. Payments MADE today
    const paymentsToday = await pool.query(`
      SELECT 
        p.id,
        p.order_id,
        c.name as customer_name,
        p.amount,
        p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi' as payment_date_eat
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE DATE(p.payment_date AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE(NOW() AT TIME ZONE 'Africa/Nairobi')
      ORDER BY p.payment_date DESC
    `);

    console.log('💰 PAYMENTS RECEIVED TODAY:');
    console.log(`   Count: ${paymentsToday.rows.length}`);
    console.log(`   Total: UGX ${paymentsToday.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0).toLocaleString()}`);
    if (paymentsToday.rows.length > 0) {
      paymentsToday.rows.forEach(payment => {
        console.log(`   - Payment #${payment.id} for Order #${payment.order_id}`);
        console.log(`     Customer: ${payment.customer_name}`);
        console.log(`     Amount: UGX ${parseFloat(payment.amount).toLocaleString()}`);
        console.log(`     Time: ${payment.payment_date_eat}`);
      });
    }
    console.log('');

    // 5. Orders with status changes today (updated_at = today)
    const ordersUpdatedToday = await pool.query(`
      SELECT 
        o.id,
        c.name as customer_name,
        o.status,
        o.total_amount,
        o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi' as created_at_eat,
        o.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi' as updated_at_eat
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE DATE(o.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE(NOW() AT TIME ZONE 'Africa/Nairobi')
        AND DATE(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') != DATE(NOW() AT TIME ZONE 'Africa/Nairobi')
      ORDER BY o.updated_at DESC
    `);

    console.log('🔄 EXISTING ORDERS UPDATED TODAY:');
    console.log(`   Count: ${ordersUpdatedToday.rows.length}`);
    if (ordersUpdatedToday.rows.length > 0) {
      ordersUpdatedToday.rows.forEach(order => {
        console.log(`   - Order #${order.id}: ${order.customer_name}`);
        console.log(`     Current Status: ${order.status}`);
        console.log(`     Created: ${order.created_at_eat}`);
        console.log(`     Updated: ${order.updated_at_eat}`);
      });
    } else {
      console.log('   No existing orders updated today');
    }
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SUMMARY:');
    console.log(`  New Orders Created Today: ${ordersCreatedToday.rows.length}`);
    console.log(`  Deliveries Completed Today: ${deliveriesToday.rows.length}`);
    console.log(`  Orders Marked Delivered Today: ${ordersDeliveredToday.rows.length}`);
    console.log(`  Payments Received Today: ${paymentsToday.rows.length}`);
    console.log(`  Existing Orders Updated Today: ${ordersUpdatedToday.rows.length}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

verifyTodaysActivity();

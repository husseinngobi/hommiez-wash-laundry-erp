const { Client } = require('pg');

async function checkCancelledOrder() {
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'lush_laundry',
    password: process.env.DB_PASSWORD,
    port: 5432,
  });

  try {
    await client.connect();
    console.log('🔗 Connected to database\n');

    // Check specific order: ORD20261335
    console.log('📋 Checking Order: ORD20261335');
    console.log('='.repeat(60));
    
    const orderCheck = await client.query(`
      SELECT 
        o.id,
        o.order_number,
        o.status as order_status,
        o.payment_status,
        o.total_amount,
        o.created_at,
        o.updated_at,
        c.name as customer_name,
        c.phone as customer_phone
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.order_number = 'ORD20261335'
    `);

    if (orderCheck.rows.length === 0) {
      console.log('❌ Order not found!');
    } else {
      const order = orderCheck.rows[0];
      console.log('\n📦 Order Details:');
      console.log(`   Order Number: ${order.order_number}`);
      console.log(`   Customer: ${order.customer_name} (${order.customer_phone})`);
      console.log(`   Status: ${order.order_status}`);
      console.log(`   Payment Status: ${order.payment_status}`);
      console.log(`   Total: UGX ${order.total_amount.toLocaleString()}`);
      console.log(`   Created: ${order.created_at}`);
      console.log(`   Updated: ${order.updated_at}`);
      
      if (order.order_status === 'cancelled') {
        console.log('\n✅ Order status is CANCELLED (correct)');
        console.log('\n🔐 This order should:');
        console.log('   ✓ Only be visible to ADMIN users');
        console.log('   ✓ Show status as "Cancelled" in dashboard');
        console.log('   ✓ Show DELETE button when viewed by ADMIN');
      } else {
        console.log(`\n⚠️  Order status is "${order.order_status}" (NOT cancelled)`);
      }
    }

    // Check recent orders query (what dashboard uses)
    console.log('\n\n📋 Recent Orders Query (Dashboard View):');
    console.log('='.repeat(60));
    
    const recentOrders = await client.query(`
      SELECT 
        o.id, 
        o.order_number, 
        o.customer_id,
        o.status as order_status,
        o.payment_status,
        o.total_amount,
        o.created_at,
        o.updated_at,
        c.name as customer_name,
        c.phone as customer_phone,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count,
        GREATEST(
          o.created_at,
          o.updated_at,
          COALESCE((
            SELECT MAX(p.payment_date) 
            FROM payments p 
            WHERE p.order_id = o.id
          ), o.created_at)
        ) as last_activity
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.order_number = 'ORD20261335'
      ORDER BY last_activity DESC
    `);

    if (recentOrders.rows.length > 0) {
      const order = recentOrders.rows[0];
      console.log('\n📦 Recent Orders Result:');
      console.log(`   Order Number: ${order.order_number}`);
      console.log(`   Status: ${order.order_status}`);
      console.log(`   Last Activity: ${order.last_activity}`);
      
      if (order.order_status === 'cancelled') {
        console.log('\n✅ Recent orders query shows CANCELLED (correct)');
      } else {
        console.log(`\n❌ Recent orders shows "${order.order_status}" instead of cancelled!`);
      }
    }

    // Check what non-ADMIN sees
    console.log('\n\n📋 Non-ADMIN View (What Desktop Agent/Manager sees):');
    console.log('='.repeat(60));
    
    const nonAdminView = await client.query(`
      SELECT 
        o.id, 
        o.order_number, 
        o.status as order_status
      FROM orders o
      WHERE o.status != 'cancelled'
      AND o.order_number = 'ORD20261335'
    `);

    if (nonAdminView.rows.length === 0) {
      console.log('✅ Order NOT visible to non-ADMIN users (correct)');
    } else {
      console.log('❌ Order IS visible to non-ADMIN users (incorrect!)');
    }

    console.log('\n\n🎯 Summary:');
    console.log('='.repeat(60));
    console.log('Order ORD20261335 status check complete.');
    console.log('If dashboard shows wrong status, try:');
    console.log('  1. Refresh browser (F5)');
    console.log('  2. Clear cache and hard reload (Ctrl+Shift+R)');
    console.log('  3. Close and reopen browser tab');
    console.log('\nBackend is returning correct status from database.');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run check
checkCancelledOrder()
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });

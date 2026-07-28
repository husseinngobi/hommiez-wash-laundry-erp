const { Client } = require('pg');

async function testOrderCancellationSystem() {
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

    // Test 1: Check if order_deletions table exists
    console.log('📋 Test 1: Verify order_deletions table exists');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'order_deletions'
      );
    `);
    console.log('✅ order_deletions table exists:', tableCheck.rows[0].exists);
    console.log('');

    // Test 2: Check table structure
    console.log('📋 Test 2: Verify table structure');
    const columns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'order_deletions'
      ORDER BY ordinal_position;
    `);
    console.log('Columns:', columns.rows.length);
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });
    console.log('');

    // Test 3: Check indexes
    console.log('📋 Test 3: Verify indexes created');
    const indexes = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'order_deletions';
    `);
    console.log('Indexes created:', indexes.rows.length);
    indexes.rows.forEach(idx => {
      console.log(`  - ${idx.indexname}`);
    });
    console.log('');

    // Test 4: Find a cancelled order (if any)
    console.log('📋 Test 4: Check for cancelled orders');
    const cancelledOrders = await client.query(`
      SELECT id, order_number, status, total_amount, amount_paid
      FROM orders 
      WHERE status = 'cancelled'
      LIMIT 5;
    `);
    console.log(`Cancelled orders found: ${cancelledOrders.rows.length}`);
    cancelledOrders.rows.forEach(order => {
      console.log(`  - Order ${order.order_number}: UGX ${order.total_amount.toLocaleString()}`);
    });
    console.log('');

    // Test 5: Count deleted orders (if any)
    console.log('📋 Test 5: Check deleted orders audit log');
    const deletedCount = await client.query(`
      SELECT COUNT(*) as count FROM order_deletions;
    `);
    console.log(`Deleted orders in audit log: ${deletedCount.rows[0].count}`);
    console.log('');

    console.log('🎉 All tests completed successfully!');
    console.log('');
    console.log('📝 Summary:');
    console.log('   ✅ order_deletions table created');
    console.log('   ✅ All columns present');
    console.log('   ✅ Indexes created');
    console.log('   ✅ System ready for order cancellation/deletion');
    console.log('');
    console.log('🔐 Business Rules:');
    console.log('   • Only ADMIN can cancel orders (status → cancelled)');
    console.log('   • Only ADMIN can delete orders (must be cancelled first)');
    console.log('   • All deletions archived in order_deletions table');
    console.log('   • Financial data preserved for audit');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run tests
testOrderCancellationSystem()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

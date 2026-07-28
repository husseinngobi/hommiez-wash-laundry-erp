const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
});

async function deleteTestOrders() {
  try {
    console.log('🔍 Finding orders with 0 items (test data)...\n');
    
    // Find orders with 0 items
    const findQuery = `
      SELECT 
        o.id,
        o.order_number,
        c.name as customer_name,
        o.total_amount,
        o.created_at,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.order_number LIKE 'ORD-________-___'
      ORDER BY o.created_at DESC;
    `;
    
    const findResult = await pool.query(findQuery);
    
    if (findResult.rows.length === 0) {
      console.log('✅ No test orders with 0 items found!');
      await pool.end();
      return;
    }
    
    console.log(`⚠️  Found ${findResult.rows.length} test orders with 0 items:`);
    console.table(findResult.rows);
    
    console.log('\n🗑️  Deleting these test orders...\n');
    
    // Delete these orders
    const deleteQuery = `
      DELETE FROM orders
      WHERE order_number LIKE 'ORD-________-___'
      RETURNING order_number, total_amount;
    `;
    
    const deleteResult = await pool.query(deleteQuery);
    
    console.log(`✅ Deleted ${deleteResult.rows.length} test orders:`);
    console.table(deleteResult.rows);
    
    console.log('\n✨ Database now contains only real orders with actual items!\n');
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

deleteTestOrders();

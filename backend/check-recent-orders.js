const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
});

async function checkRecentOrders() {
  try {
    console.log('📊 Checking Orders in Database...\n');
    
    // Get order statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN order_status != 'DELIVERED' THEN 1 END) as active_orders,
        COUNT(CASE WHEN order_status = 'DELIVERED' THEN 1 END) as delivered_orders
      FROM orders;
    `;
    
    const statsResult = await pool.query(statsQuery);
    console.log('📈 Order Statistics:');
    console.table(statsResult.rows);
    
    // Get latest 10 orders
    const ordersQuery = `
      SELECT 
        o.order_number,
        c.name as customer_name,
        o.order_status,
        o.created_at,
        o.total_amount,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ORDER BY o.created_at DESC
      LIMIT 10;
    `;
    
    const ordersResult = await pool.query(ordersQuery);
    console.log('\n📋 Latest 10 Orders (Most Recent First):');
    console.table(ordersResult.rows);
    
    // Check if Mary Byamugisha exists
    const customerCheck = await pool.query(
      "SELECT * FROM customers WHERE name ILIKE '%mary%' OR name ILIKE '%byam%'"
    );
    
    if (customerCheck.rows.length > 0) {
      console.log('\n👤 Customers with "Mary" or "Byam" in name:');
      console.table(customerCheck.rows.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone
      })));
    } else {
      console.log('\n❌ No customer found with "Mary Byamugisha" or similar name');
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkRecentOrders();

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkSalesPersonData() {
  try {
    console.log('\n🔍 Checking Sales Person Data Assignment...\n');
    
    // Check total orders and user assignment
    const orderStats = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(user_id) as orders_with_user,
        COUNT(CASE WHEN user_id IS NULL THEN 1 END) as orders_without_user
      FROM orders
    `);
    
    console.log('📊 Orders Database Status:');
    console.log('========================');
    console.table(orderStats.rows);
    
    // Check available users
    const users = await pool.query(`
      SELECT id, full_name, role, email 
      FROM users 
      ORDER BY id
    `);
    
    console.log('\n👥 Available Users in System:');
    console.table(users.rows);
    
    // Sample recent orders with staff info
    const recentOrders = await pool.query(`
      SELECT 
        o.id,
        o.order_number,
        o.created_at,
        o.user_id,
        u.full_name as staff_name,
        u.role as user_role
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `);
    
    console.log('\n📦 Sample Recent Orders (with staff info):');
    console.table(recentOrders.rows);
    
    // Check orders by staff member
    const ordersByStaff = await pool.query(`
      SELECT 
        u.full_name,
        u.role,
        COUNT(o.id) as order_count
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id, u.full_name, u.role
      ORDER BY order_count DESC
    `);
    
    console.log('\n📈 Orders by Staff Member:');
    console.table(ordersByStaff.rows);
    
    // Check date ranges for Days Old calculation
    const dateRange = await pool.query(`
      SELECT 
        MIN(created_at) as oldest_order,
        MAX(created_at) as newest_order,
        COUNT(*) as total
      FROM orders
    `);
    
    console.log('\n📅 Order Date Range (for Days Old calculation):');
    console.table(dateRange.rows);
    
    await pool.end();
    console.log('\n✅ Analysis Complete!\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkSalesPersonData();

const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
});

async function checkNewFormatOrders() {
  try {
    console.log('🔍 Investigating new format orders...\n');
    
    const query = `
      SELECT 
        o.id,
        o.order_number,
        o.pickup_date,
        o.user_id,
        u.email as created_by_user,
        o.created_at,
        o.order_status
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.order_number LIKE 'ORD-________-___'
      ORDER BY o.created_at DESC
      LIMIT 10;
    `;
    
    const result = await pool.query(query);
    
    if (result.rows.length > 0) {
      console.log('📋 New Format Orders:');
      console.table(result.rows);
    } else {
      console.log('✅ No new format orders found');
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkNewFormatOrders();

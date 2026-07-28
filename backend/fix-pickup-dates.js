const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
});

async function fixNullPickupDates() {
  try {
    console.log('🔧 Fixing NULL pickup dates...\n');
    
    // Get all orders with NULL pickup dates
    const checkQuery = `
      SELECT 
        id,
        order_number,
        created_at,
        order_status
      FROM orders 
      WHERE pickup_date IS NULL
      ORDER BY created_at DESC;
    `;
    
    const checkResult = await pool.query(checkQuery);
    
    if (checkResult.rows.length === 0) {
      console.log('✅ No orders with NULL pickup dates found!');
      await pool.end();
      return;
    }
    
    console.log(`⚠️  Found ${checkResult.rows.length} orders with NULL pickup dates:`);
    console.table(checkResult.rows);
    
    // Fix: Set pickup_date to created_at + 3 days
    console.log('\n📝 Updating pickup dates (created_at + 3 days)...\n');
    
    const updateQuery = `
      UPDATE orders
      SET pickup_date = created_at + INTERVAL '3 days'
      WHERE pickup_date IS NULL
      RETURNING id, order_number, created_at, pickup_date;
    `;
    
    const updateResult = await pool.query(updateQuery);
    
    console.log(`✅ Fixed ${updateResult.rows.length} orders:`);
    console.table(updateResult.rows);
    
    console.log('\n✨ All pickup dates have been set!\n');
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

fixNullPickupDates();

const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
});

async function checkPickupDates() {
  try {
    console.log('🔍 Checking orders with problematic pickup dates...\n');
    
    // Check for orders with epoch date (1970-01-01)
    const epochQuery = `
      SELECT 
        id,
        order_number, 
        pickup_date,
        created_at,
        order_status
      FROM orders 
      WHERE pickup_date < '2000-01-01'
      ORDER BY created_at DESC
      LIMIT 10;
    `;
    
    const epochResult = await pool.query(epochQuery);
    
    if (epochResult.rows.length > 0) {
      console.log('❌ Orders with 1970 epoch dates found:');
      console.table(epochResult.rows);
    } else {
      console.log('✅ No orders with 1970 epoch dates found');
    }
    
    // Check specific order
    const specificQuery = `
      SELECT 
        id,
        order_number, 
        pickup_date,
        created_at,
        order_status
      FROM orders 
      WHERE order_number LIKE '%778%'
      ORDER BY created_at DESC;
    `;
    
    const specificResult = await pool.query(specificQuery);
    
    if (specificResult.rows.length > 0) {
      console.log('\n📋 Order(s) containing "778":');
      console.table(specificResult.rows);
    }
    
    // Check for NULL pickup dates
    const nullQuery = `
      SELECT 
        id,
        order_number, 
        pickup_date,
        created_at,
        order_status
      FROM orders 
      WHERE pickup_date IS NULL
      ORDER BY created_at DESC
      LIMIT 5;
    `;
    
    const nullResult = await pool.query(nullQuery);
    
    if (nullResult.rows.length > 0) {
      console.log('\n⚠️  Orders with NULL pickup dates:');
      console.table(nullResult.rows);
    } else {
      console.log('\n✅ No orders with NULL pickup dates');
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkPickupDates();

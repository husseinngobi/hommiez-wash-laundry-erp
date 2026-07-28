const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'lush_laundry',
  password: process.env.DB_PASSWORD,
  port: 5432
});

async function checkOrdersColumns() {
  const client = await pool.connect();
  try {
    console.log('=== CHECKING ORDERS TABLE COLUMNS ===\n');
    
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'orders'
      ORDER BY ordinal_position
    `);
    
    console.log('Current columns in orders table:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name} (${row.data_type}) - Nullable: ${row.is_nullable}`);
    });
    
    // Check if pickup_date and payment_method exist
    const hasPickupDate = result.rows.some(row => row.column_name === 'pickup_date');
    const hasPaymentMethod = result.rows.some(row => row.column_name === 'payment_method');
    
    console.log('\n=== MISSING COLUMNS ===');
    if (!hasPickupDate) {
      console.log('❌ pickup_date - MISSING');
    } else {
      console.log('✅ pickup_date - EXISTS');
    }
    
    if (!hasPaymentMethod) {
      console.log('❌ payment_method - MISSING');
    } else {
      console.log('✅ payment_method - EXISTS');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkOrdersColumns();

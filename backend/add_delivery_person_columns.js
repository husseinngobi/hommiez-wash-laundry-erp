const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function addDeliveryPersonColumns() {
  try {
    console.log('\n🔧 Adding delivery person and vehicle columns...\n');
    
    // Add delivery_person_name column
    await pool.query(`
      ALTER TABLE deliveries 
      ADD COLUMN IF NOT EXISTS delivery_person_name VARCHAR(255)
    `);
    console.log('✅ Added delivery_person_name column');
    
    // Add vehicle_info column
    await pool.query(`
      ALTER TABLE deliveries 
      ADD COLUMN IF NOT EXISTS vehicle_info VARCHAR(255)
    `);
    console.log('✅ Added vehicle_info column');
    
    console.log('\n✅ Database updated successfully!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

addDeliveryPersonColumns();

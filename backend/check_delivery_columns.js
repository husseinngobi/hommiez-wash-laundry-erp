const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkDeliveryColumns() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'deliveries'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📦 Deliveries Table Columns:');
    console.log('==============================\n');
    
    result.rows.forEach((col) => {
      console.log(`${col.column_name} (${col.data_type}) - ${col.is_nullable === 'YES' ? 'Optional' : 'Required'}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDeliveryColumns();

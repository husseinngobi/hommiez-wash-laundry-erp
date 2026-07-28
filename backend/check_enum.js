const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkEnum() {
  try {
    const result = await pool.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = (
        SELECT oid 
        FROM pg_type 
        WHERE typname = 'user_role'
      )
    `);
    
    console.log('Current user_role enum values:');
    result.rows.forEach(row => console.log('-', row.enumlabel));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkEnum();

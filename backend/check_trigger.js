const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkTrigger() {
  try {
    console.log('🔍 Checking trigger function definition...\n');
    
    const result = await pool.query(`
      SELECT pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname = 'update_revenue_summary';
    `);
    
    console.log(result.rows[0].definition);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTrigger();

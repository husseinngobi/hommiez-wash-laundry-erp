const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkTriggerEvent() {
  try {
    console.log('🔍 Checking trigger configuration...\n');
    
    const result = await pool.query(`
      SELECT
        tgname as trigger_name,
        CASE tgtype & 66
          WHEN 2 THEN 'BEFORE'
          WHEN 64 THEN 'INSTEAD OF'
          ELSE 'AFTER'
        END as timing,
        CASE tgtype & 28
          WHEN 4 THEN 'INSERT'
          WHEN 8 THEN 'DELETE'
          WHEN 16 THEN 'UPDATE'
          WHEN 12 THEN 'INSERT OR DELETE'
          WHEN 20 THEN 'INSERT OR UPDATE'
          WHEN 24 THEN 'DELETE OR UPDATE'
          WHEN 28 THEN 'INSERT OR DELETE OR UPDATE'
        END as event,
        tgtype
      FROM pg_trigger
      WHERE tgname = 'trigger_update_revenue_summary';
    `);
    
    console.log(result.rows[0]);
    console.log('\nTrigger fires on:', result.rows[0].timing, result.rows[0].event);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTriggerEvent();

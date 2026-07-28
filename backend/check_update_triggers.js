const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkUpdateTriggers() {
  try {
    console.log('🔍 Checking all triggers that fire on UPDATE orders...\n');
    
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
        proname as function_name
      FROM pg_trigger t
      JOIN pg_proc p ON t.tgfoid = p.oid
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE c.relname = 'orders'
      AND tgisinternal = false
      AND (tgtype & 16) = 16;  -- Check if UPDATE bit is set
    `);
    
    if (result.rows.length > 0) {
      console.log('Found triggers that fire on UPDATE:');
      result.rows.forEach(row => {
        console.log(`\n- ${row.trigger_name}`);
        console.log(`  Timing: ${row.timing}`);
        console.log(`  Event: ${row.event}`);
        console.log(`  Function: ${row.function_name}`);
      });
    } else {
      console.log('No UPDATE triggers found ✅');
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUpdateTriggers();

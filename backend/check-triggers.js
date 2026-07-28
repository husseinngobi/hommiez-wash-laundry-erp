const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
});

async function checkTriggers() {
  try {
    console.log('🔍 Checking database triggers...\n');
    
    const query = `
      SELECT 
        t.tgname as trigger_name,
        c.relname as table_name,
        p.proname as function_name,
        pg_get_triggerdef(t.oid) as trigger_definition
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_proc p ON t.tgfoid = p.oid
      WHERE NOT t.tgisinternal
        AND c.relname = 'orders'
      ORDER BY c.relname, t.tgname;
    `;
    
    const result = await pool.query(query);
    
    if (result.rows.length > 0) {
      console.log('📋 Triggers on orders table:');
      result.rows.forEach(row => {
        console.log(`\n🔔 Trigger: ${row.trigger_name}`);
        console.log(`   Table: ${row.table_name}`);
        console.log(`   Function: ${row.function_name}`);
        console.log(`   Definition: ${row.trigger_definition}`);
      });
    } else {
      console.log('✅ No custom triggers found on orders table');
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkTriggers();

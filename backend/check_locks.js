const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkForIssues() {
  try {
    console.log('🔍 Checking for database issues...\n');
    
    // 1. Check for triggers on orders table
    console.log('1️⃣ Checking triggers on orders table:');
    const triggers = await pool.query(`
      SELECT 
        tgname as trigger_name,
        proname as function_name,
        tgtype
      FROM pg_trigger t
      JOIN pg_proc p ON t.tgfoid = p.oid
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE c.relname = 'orders'
      AND tgisinternal = false;
    `);
    console.log(triggers.rows.length > 0 ? triggers.rows : 'No triggers found ✅');
    
    // 2. Check for active locks
    console.log('\n2️⃣ Checking for active locks:');
    const locks = await pool.query(`
      SELECT
        l.pid,
        l.mode,
        l.granted,
        c.relname as table_name,
        a.query
      FROM pg_locks l
      JOIN pg_class c ON l.relation = c.oid
      JOIN pg_stat_activity a ON l.pid = a.pid
      WHERE c.relname IN ('orders', 'pending_payments', 'payments')
      AND a.state != 'idle';
    `);
    console.log(locks.rows.length > 0 ? locks.rows : 'No active locks ✅');
    
    // 3. Check indexes on orders table
    console.log('\n3️⃣ Checking indexes on orders table:');
    const indexes = await pool.query(`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'orders';
    `);
    console.log(indexes.rows);
    
    // 4. Check for foreign keys
    console.log('\n4️⃣ Checking foreign keys referencing orders:');
    const fkeys = await pool.query(`
      SELECT
        conname as constraint_name,
        conrelid::regclass as from_table,
        a.attname as from_column,
        confrelid::regclass as to_table,
        af.attname as to_column
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
      JOIN pg_attribute af ON af.attnum = ANY(c.confkey) AND af.attrelid = c.confrelid
      WHERE confrelid = 'orders'::regclass
      AND contype = 'f';
    `);
    console.log(fkeys.rows.length > 0 ? fkeys.rows : 'No foreign keys found ✅');
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkForIssues();

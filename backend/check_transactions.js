const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkTransactions() {
  try {
    console.log('🔍 Checking for active/stuck transactions...\n');
    
    // Check for active transactions
    const result = await pool.query(`
      SELECT 
        pid,
        usename,
        application_name,
        state,
        query_start,
        state_change,
        wait_event_type,
        wait_event,
        backend_xid,
        backend_xmin,
        LEFT(query, 100) as query_preview
      FROM pg_stat_activity
      WHERE datname = 'lush_laundry'
        AND state != 'idle'
      ORDER BY query_start;
    `);
    
    console.log('Active Transactions:');
    console.table(result.rows);
    
    // Check for locks
    const locks = await pool.query(`
      SELECT 
        l.locktype,
        l.mode,
        l.granted,
        c.relname as table_name,
        a.query_start,
        LEFT(a.query, 80) as query_preview
      FROM pg_locks l
      LEFT JOIN pg_class c ON l.relation = c.oid
      LEFT JOIN pg_stat_activity a ON l.pid = a.pid
      WHERE a.datname = 'lush_laundry'
        AND c.relname IN ('orders', 'pending_payments', 'payments')
      ORDER BY l.granted DESC, a.query_start;
    `);
    
    console.log('\nLocks on Payment Tables:');
    console.table(locks.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTransactions();

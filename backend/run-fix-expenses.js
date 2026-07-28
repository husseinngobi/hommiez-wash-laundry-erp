const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'lush_laundry',
  password: process.env.DB_PASSWORD,
  port: 5432,
});

async function runFix() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'fix-expenses-approval.sql'), 'utf8');
    
    console.log('🔧 Fixing expenses table...\n');
    
    const result = await pool.query(sql);
    console.log('✅ Fix applied successfully!\n');
    
    if (result.rows && result.rows.length > 0) {
      console.log('📋 Expenses table structure:');
      console.table(result.rows);
    }
    
    if (result.notices && result.notices.length > 0) {
      result.notices.forEach(notice => console.log('ℹ️', notice.message));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runFix();

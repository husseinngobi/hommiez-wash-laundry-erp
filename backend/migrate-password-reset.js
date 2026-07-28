const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'lush_laundry',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding columns to password_reset_requests...');
    
    await client.query(`
      ALTER TABLE password_reset_requests 
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES users(id)
    `);
    
    console.log('✅ Columns added!');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_status 
      ON password_reset_requests(status)
    `);
    
    console.log('✅ Index created!');
    console.log('✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

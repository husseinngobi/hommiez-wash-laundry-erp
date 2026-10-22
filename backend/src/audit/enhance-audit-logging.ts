import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'hommiez_wash',
});

async function enhanceAuditLogging() {
  console.log('📊 Enhancing Audit Logging System\n');

  try {
    // Check current activity_logs structure
    const checkStructure = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'activity_logs'
      ORDER BY ordinal_position
    `);

    console.log('Current activity_logs structure:');
    checkStructure.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type}`);
    });

    // Check if we need to add additional columns for better tracking
    const existingColumns = checkStructure.rows.map(row => row.column_name);

    // Add IP address tracking if not present
    if (!existingColumns.includes('ip_address')) {
      await pool.query(`
        ALTER TABLE activity_logs
        ADD COLUMN ip_address VARCHAR(45)
      `);
      console.log('\n✅ Added: ip_address column for security tracking');
    } else {
      console.log('\n⏭️  ip_address column already exists');
    }

    // Add user agent tracking if not present
    if (!existingColumns.includes('user_agent')) {
      await pool.query(`
        ALTER TABLE activity_logs
        ADD COLUMN user_agent TEXT
      `);
      console.log('✅ Added: user_agent column for device tracking');
    } else {
      console.log('⏭️  user_agent column already exists');
    }

    // Add severity level if not present
    if (!existingColumns.includes('severity')) {
      await pool.query(`
        ALTER TABLE activity_logs
        ADD COLUMN severity VARCHAR(20) DEFAULT 'INFO'
      `);
      console.log('✅ Added: severity column (INFO/WARNING/ERROR/CRITICAL)');
    } else {
      console.log('⏭️  severity column already exists');
    }

    // Create index for faster queries
    const indexCheck = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'activity_logs'
      AND indexname = 'idx_activity_logs_user_action'
    `);

    if (indexCheck.rows.length === 0) {
      await pool.query(`
        CREATE INDEX idx_activity_logs_user_action 
        ON activity_logs(user_id, action, created_at DESC)
      `);
      console.log('✅ Added: Index on user_id, action, created_at for faster queries');
    } else {
      console.log('⏭️  Index already exists');
    }

    // Create index for IP tracking
    const ipIndexCheck = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'activity_logs'
      AND indexname = 'idx_activity_logs_ip_created'
    `);

    if (ipIndexCheck.rows.length === 0 && existingColumns.includes('ip_address')) {
      await pool.query(`
        CREATE INDEX idx_activity_logs_ip_created 
        ON activity_logs(ip_address, created_at DESC)
      `);
      console.log('✅ Added: Index on ip_address, created_at for security analysis');
    }

    console.log('\n✅ Audit Logging Enhancement Complete!');
    console.log('\n📝 Enhanced Logging Capabilities:');
    console.log('   - IP address tracking for security analysis');
    console.log('   - User agent tracking for device identification');
    console.log('   - Severity levels (INFO/WARNING/ERROR/CRITICAL)');
    console.log('   - Optimized indexes for fast queries');
    console.log('\n📌 Recommended Actions to Log:');
    console.log('   - CREATE: User created, Order created, Customer created');
    console.log('   - UPDATE: User updated, Order modified, Payment updated');
    console.log('   - DELETE: User deleted, Order cancelled');
    console.log('   - AUTH: Login success/failure, Logout, Password change');
    console.log('   - SECURITY: Failed login attempts, Account locked, Suspicious activity');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

enhanceAuditLogging();

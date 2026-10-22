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

async function addBruteForceProtection() {
  console.log('🔒 Adding Brute Force Protection Columns to Users Table\n');

  try {
    // Check if columns already exist
    const checkColumns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('failed_login_attempts', 'account_locked_until', 'last_failed_login')
    `);

    const existingColumns = checkColumns.rows.map(row => row.column_name);
    console.log('Existing security columns:', existingColumns.length > 0 ? existingColumns.join(', ') : 'None');

    // Add failed_login_attempts column
    if (!existingColumns.includes('failed_login_attempts')) {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN failed_login_attempts INTEGER DEFAULT 0 NOT NULL
      `);
      console.log('✅ Added: failed_login_attempts (INTEGER, default 0)');
    } else {
      console.log('⏭️  Skipped: failed_login_attempts (already exists)');
    }

    // Add account_locked_until column
    if (!existingColumns.includes('account_locked_until')) {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN account_locked_until TIMESTAMP
      `);
      console.log('✅ Added: account_locked_until (TIMESTAMP, nullable)');
    } else {
      console.log('⏭️  Skipped: account_locked_until (already exists)');
    }

    // Add last_failed_login column for tracking
    if (!existingColumns.includes('last_failed_login')) {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN last_failed_login TIMESTAMP
      `);
      console.log('✅ Added: last_failed_login (TIMESTAMP, nullable)');
    } else {
      console.log('⏭️  Skipped: last_failed_login (already exists)');
    }

    // Verify the changes
    const verifyColumns = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('failed_login_attempts', 'account_locked_until', 'last_failed_login')
      ORDER BY column_name
    `);

    console.log('\n📊 Security Columns Verification:');
    verifyColumns.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type} (default: ${row.column_default || 'NULL'})`);
    });

    console.log('\n✅ Brute Force Protection Enhancement Complete!');
    console.log('\n📝 Usage:');
    console.log('   - failed_login_attempts: Increment on each failed login');
    console.log('   - account_locked_until: Set to NOW() + 30 minutes after 5 failed attempts');
    console.log('   - last_failed_login: Track when last failure occurred');
    console.log('   - Reset failed_login_attempts to 0 on successful login');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addBruteForceProtection();

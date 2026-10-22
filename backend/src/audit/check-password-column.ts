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

async function checkPasswordColumn() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name LIKE '%password%'
      ORDER BY column_name
    `);
    
    console.log('Password-related columns in users table:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });

    // Also check for actual passwords
    const passwordCheck = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(password) as users_with_password
      FROM users
    `);
    console.log('\nPassword status:');
    console.log(`  Total users: ${passwordCheck.rows[0].total_users}`);
    console.log(`  Users with password: ${passwordCheck.rows[0].users_with_password}`);

    // Sample a password to see format
    const samplePassword = await pool.query(`
      SELECT LEFT(password, 10) as password_sample
      FROM users
      WHERE password IS NOT NULL
      LIMIT 1
    `);
    
    if (samplePassword.rows.length > 0) {
      console.log(`  Password format (first 10 chars): ${samplePassword.rows[0].password_sample}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkPasswordColumn();

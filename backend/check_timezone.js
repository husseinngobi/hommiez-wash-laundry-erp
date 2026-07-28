const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkWithTimezone() {
  try {
    console.log('=== TIMEZONE-AWARE CHECK ===\n');
    
    // Check using East Africa Time
    const todayEAT = await pool.query(`
      SELECT COUNT(*) as count 
      FROM orders 
      WHERE DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = 
            DATE(NOW() AT TIME ZONE 'Africa/Nairobi')
    `);
    console.log('Orders created TODAY (EAT timezone):', todayEAT.rows[0].count);
    
    // Show what date we're checking for
    const currentDate = await pool.query(`
      SELECT 
        DATE(NOW() AT TIME ZONE 'Africa/Nairobi') as eat_date,
        NOW() AT TIME ZONE 'Africa/Nairobi' as eat_time,
        CURRENT_DATE as utc_date,
        NOW() as utc_time
    `);
    console.log('\nCurrent Date (EAT):', currentDate.rows[0].eat_date);
    console.log('Current Time (EAT):', currentDate.rows[0].eat_time);
    console.log('Current Date (UTC):', currentDate.rows[0].utc_date);
    console.log('Current Time (UTC):', currentDate.rows[0].utc_time);
    
    // Check payments today with timezone
    const paymentsToday = await pool.query(`
      SELECT COUNT(*) as count
      FROM payments
      WHERE DATE(payment_date AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = 
            DATE(NOW() AT TIME ZONE 'Africa/Nairobi')
    `);
    console.log('\nPayments made TODAY (EAT timezone):', paymentsToday.rows[0].count);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkWithTimezone();

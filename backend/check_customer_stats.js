const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkCustomerStats() {
  try {
    // Get customer type distribution
    const typeStats = await pool.query(`
      SELECT customer_type, COUNT(*) as count 
      FROM customers 
      GROUP BY customer_type
    `);
    
    console.log('\n📊 Customer Type Distribution:');
    typeStats.rows.forEach(row => {
      console.log(`  ${row.customer_type}: ${row.count} customers`);
    });
    
    // Get total count
    const total = await pool.query('SELECT COUNT(*) as total FROM customers');
    console.log(`\n📈 Total Customers: ${total.rows[0].total}`);
    
    // Get SMS opt-in stats
    const smsStats = await pool.query(`
      SELECT sms_opt_in, COUNT(*) as count 
      FROM customers 
      GROUP BY sms_opt_in
    `);
    
    console.log('\n📱 SMS Opt-in Distribution:');
    smsStats.rows.forEach(row => {
      console.log(`  ${row.sms_opt_in ? 'Opted In' : 'Opted Out'}: ${row.count} customers`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkCustomerStats();

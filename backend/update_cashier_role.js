const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function updateCashierRole() {
  try {
    console.log('Updating cashier account role...');
    
    const result = await pool.query(
      `UPDATE users 
       SET role = 'DESKTOP_AGENT' 
       WHERE email = 'user@lushlaundry.com' 
       RETURNING id, email, full_name, role, status`
    );
    
    console.log('\n✅ Successfully updated cashier account:');
    console.log(JSON.stringify(result.rows[0], null, 2));
    
    console.log('\nAll users:');
    const allUsers = await pool.query('SELECT id, email, full_name, role, status FROM users ORDER BY id');
    console.log(JSON.stringify(allUsers.rows, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

updateCashierRole();

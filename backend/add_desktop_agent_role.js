const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function addDesktopAgentRole() {
  try {
    console.log('Step 1: Adding DESKTOP_AGENT to user_role enum...');
    
    await pool.query(`
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'DESKTOP_AGENT'
    `);
    
    console.log('✅ DESKTOP_AGENT added to enum');
    
    console.log('\nStep 2: Updating cashier account role...');
    
    const result = await pool.query(`
      UPDATE users 
      SET role = 'DESKTOP_AGENT' 
      WHERE email = 'user@lushlaundry.com' 
      RETURNING id, email, full_name, role, status
    `);
    
    console.log('\n✅ Successfully updated cashier account:');
    console.log(JSON.stringify(result.rows[0], null, 2));
    
    console.log('\nAll users:');
    const allUsers = await pool.query('SELECT id, email, full_name, role, status FROM users ORDER BY id');
    allUsers.rows.forEach(user => {
      console.log(`- ${user.full_name} (${user.email}): ${user.role}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

addDesktopAgentRole();

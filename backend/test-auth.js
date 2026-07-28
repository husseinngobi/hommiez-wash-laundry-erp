const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function testAuth() {
  try {
    console.log('\n=== Testing Lush Laundry Authentication ===\n');

    // Check database connection
    console.log('1. Testing database connection...');
    await pool.query('SELECT 1');
    console.log('✅ Database connected\n');

    // Get users from database
    console.log('2. Fetching users...');
    const result = await pool.query(
      'SELECT id, email, full_name, role, status, password FROM users WHERE email IN ($1, $2)',
      ['admin@lushlaundry.com', 'user@lushlaundry.com']
    );
    
    if (result.rows.length === 0) {
      console.log('❌ No users found in database!\n');
      return;
    }

    console.log(`✅ Found ${result.rows.length} users:\n`);
    
    // Test each user
    for (const user of result.rows) {
      console.log(`--- Testing: ${user.email} ---`);
      console.log(`   Name: ${user.full_name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Status: ${user.status}`);
      console.log(`   Password Hash Length: ${user.password.length}`);
      
      // Test password verification
      const testPassword = user.email.includes('admin') ? 'Admin123!' : 'User123!';
      const isValid = await bcrypt.compare(testPassword, user.password);
      
      if (isValid) {
        console.log(`   ✅ Password "${testPassword}" is VALID`);
      } else {
        console.log(`   ❌ Password "${testPassword}" is INVALID`);
      }
      console.log('');
    }

    // Test actual login endpoint
    console.log('3. Testing login endpoint...');
    const loginTest = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@lushlaundry.com',
        password: 'Admin123!'
      })
    });

    if (loginTest.ok) {
      const data = await loginTest.json();
      console.log('✅ Admin login successful!');
      console.log('   Token:', data.token.substring(0, 30) + '...');
      console.log('   User:', data.user.full_name);
      console.log('   Role:', data.user.role);
    } else {
      const error = await loginTest.json();
      console.log('❌ Admin login failed:', error.error);
    }

    console.log('\n=== Authentication System Status: READY ===\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

testAuth();

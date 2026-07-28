const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkDrivers() {
  try {
    const result = await pool.query(`
      SELECT id, name, phone, vehicle_type, vehicle_number, status 
      FROM delivery_drivers 
      ORDER BY id
    `);
    
    console.log('\n🚗 Delivery Drivers in Database:');
    console.log('================================\n');
    
    if (result.rows.length === 0) {
      console.log('❌ No drivers found in database!\n');
    } else {
      result.rows.forEach((driver, index) => {
        console.log(`${index + 1}. ${driver.name}`);
        console.log(`   📞 Phone: ${driver.phone}`);
        console.log(`   🚙 Vehicle: ${driver.vehicle_type} - ${driver.vehicle_number}`);
        console.log(`   ✅ Status: ${driver.status}\n`);
      });
      console.log(`Total: ${result.rows.length} driver(s)\n`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDrivers();

const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'lush_laundry',
  password: process.env.DB_PASSWORD,
  port: 5432
});

async function checkCustomerIDs() {
  const client = await pool.connect();
  try {
    console.log('=== FIRST 5 CUSTOMERS (Oldest) ===');
    let result = await client.query(
      'SELECT id, customer_id, name, created_at FROM customers ORDER BY id ASC LIMIT 5'
    );
    result.rows.forEach(row => {
      console.log(`ID: ${row.id} | Customer_ID: ${row.customer_id} | Name: ${row.name}`);
    });

    console.log('\n=== LAST 5 CUSTOMERS (Newest) ===');
    result = await client.query(
      'SELECT id, customer_id, name, created_at FROM customers ORDER BY id DESC LIMIT 5'
    );
    result.rows.forEach(row => {
      console.log(`ID: ${row.id} | Customer_ID: ${row.customer_id} | Name: ${row.name}`);
    });

    console.log('\n=== TOTAL CUSTOMERS ===');
    result = await client.query('SELECT COUNT(*) as total FROM customers');
    console.log(`Total: ${result.rows[0].total}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkCustomerIDs();

const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkSchema() {
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'orders'
      ORDER BY ordinal_position
    `);
    
    console.log('Orders table columns:');
    console.log('='.repeat(60));
    result.rows.forEach(row => {
      console.log(`${row.column_name.padEnd(25)} ${row.data_type.padEnd(20)} ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    await client.end();
  } catch (error) {
    console.error('Error:', error.message);
    await client.end();
  }
}

checkSchema();

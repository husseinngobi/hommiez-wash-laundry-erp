const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'lush_laundry',
  password: process.env.DB_PASSWORD,
  port: 5432,
});

async function checkEnums() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    // Check order_status enum values
    const orderStatusResult = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_status')
      ORDER BY enumsortorder
    `);
    
    console.log('📋 Valid ORDER_STATUS values:');
    orderStatusResult.rows.forEach(row => {
      console.log(`  - "${row.enumlabel}"`);
    });
    
    console.log('\n');
    
    // Check payment_status enum values
    const paymentStatusResult = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'payment_status')
      ORDER BY enumsortorder
    `);
    
    console.log('💰 Valid PAYMENT_STATUS values:');
    paymentStatusResult.rows.forEach(row => {
      console.log(`  - "${row.enumlabel}"`);
    });
    
    console.log('\n');
    
    // Check subtotal, discount, tax column types
    const columnTypesResult = await client.query(`
      SELECT column_name, data_type, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_name = 'orders'
      AND column_name IN ('subtotal', 'discount', 'tax', 'total', 'amount_paid', 'total_amount', 'balance')
      ORDER BY ordinal_position
    `);
    
    console.log('🔢 Orders table numeric column types:');
    columnTypesResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}${row.numeric_precision ? `(${row.numeric_precision}, ${row.numeric_scale})` : ''}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkEnums();

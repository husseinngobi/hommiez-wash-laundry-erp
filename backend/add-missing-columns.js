const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'lush_laundry',
  password: process.env.DB_PASSWORD,
  port: 5432
});

async function addMissingColumns() {
  const client = await pool.connect();
  try {
    console.log('🔧 Adding missing columns to orders table...\n');
    
    await client.query('BEGIN');
    
    // Add pickup_date
    console.log('Adding pickup_date column...');
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS pickup_date TIMESTAMP
    `);
    console.log('✅ pickup_date added');
    
    // Add payment_method
    console.log('Adding payment_method column...');
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)
    `);
    console.log('✅ payment_method added');
    
    // Add transaction_reference
    console.log('Adding transaction_reference column...');
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(100)
    `);
    console.log('✅ transaction_reference added');
    
    // Add invoice_number
    console.log('Adding invoice_number column...');
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50)
    `);
    console.log('✅ invoice_number added');
    
    // Add discount fields
    console.log('Adding discount columns...');
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0
    `);
    console.log('✅ discount_percentage and discount_amount added');
    
    // Add tax fields
    console.log('Adding tax columns...');
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) DEFAULT 0
    `);
    console.log('✅ tax_rate and tax_amount added');
    
    await client.query('COMMIT');
    
    console.log('\n✅ All columns added successfully!\n');
    
    // Verify
    console.log('Verifying columns...\n');
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'orders'
      AND column_name IN ('pickup_date', 'payment_method', 'transaction_reference', 'invoice_number', 'discount_percentage', 'discount_amount', 'tax_rate', 'tax_amount')
      ORDER BY column_name
    `);
    
    result.rows.forEach(row => {
      console.log(`✓ ${row.column_name} (${row.data_type})`);
    });
    
    console.log('\n🎉 Orders table updated successfully!');
    console.log('You can now update order status and add payments.');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

addMissingColumns();

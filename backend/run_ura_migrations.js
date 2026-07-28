const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function migrate() {
  try {
    console.log('🔄 Running URA compliance migrations...\n');
    
    // Migration 1: Add tax fields
    console.log('1️⃣ Adding tax fields to orders table...');
    const sql1 = fs.readFileSync('./src/database/migrations/013_add_tax_fields_to_orders.sql', 'utf8');
    await pool.query(sql1);
    console.log('✅ Tax fields added successfully\n');
    
    // Migration 2: Add business settings
    console.log('2️⃣ Adding URA business settings...');
    const sql2 = fs.readFileSync('./src/database/migrations/014_add_ura_business_settings.sql', 'utf8');
    await pool.query(sql2);
    console.log('✅ Business settings added successfully\n');
    
    console.log('🎉 All migrations completed successfully!');
    await pool.end();
  } catch (err) {
    console.error('❌ Migration error:', err);
    process.exit(1);
  }
}

migrate();

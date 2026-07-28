// Simple migration runner script
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Database configuration (from your .env)
const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD,
});

async function runMigration() {
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✓ Connected to lush_laundry database\n');

    console.log('Adding delivery_revenue column...\n');
    
    // 1. Add delivery_revenue column
    await client.query(`
      ALTER TABLE deliveries 
      ADD COLUMN IF NOT EXISTS delivery_revenue NUMERIC(10,2) DEFAULT 0;
    `);
    console.log('✅ Added delivery_revenue column');
    
    // 2. Add comment
    await client.query(`
      COMMENT ON COLUMN deliveries.delivery_revenue IS 
        'Amount customer pays for delivery service. PAID deliveries have value > 0, FREE deliveries = 0';
    `);
    console.log('✅ Added column comment');
    
    // 3. Update existing records
    await client.query(`
      UPDATE deliveries SET delivery_revenue = 0 WHERE delivery_revenue IS NULL;
    `);
    console.log('✅ Updated existing records');
    
    // 4. Create index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_deliveries_revenue ON deliveries(delivery_revenue);
    `);
    console.log('✅ Created index');
    
    // 5. Add constraint
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_delivery_revenue_positive'
        ) THEN
          ALTER TABLE deliveries 
          ADD CONSTRAINT chk_delivery_revenue_positive CHECK (delivery_revenue >= 0);
        END IF;
      END $$;
    `);
    console.log('✅ Added constraint');
    
    // 6. Verify
    const result = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'deliveries' AND column_name = 'delivery_revenue';
    `);
    
    if (result.rows.length > 0) {
      console.log('\n✅ MIGRATION SUCCESSFUL!');
      console.log('Column details:', result.rows[0]);
      console.log('\nYou can now restart the backend server and create deliveries with revenue tracking!');
    } else {
      console.log('\n❌ Migration may have failed - column not found');
    }
    
  } catch (error) {
    console.error('\n✗ Migration failed:');
    console.error(error.message);
    console.error('\nIf you see "already exists" errors, the column is already created.');
    console.error('Otherwise, check your database password in this file.\n');
  } finally {
    await client.end();
  }
}

runMigration();

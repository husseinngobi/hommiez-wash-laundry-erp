const { Client } = require('pg');

async function runMigration() {
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'lush_laundry',
    password: process.env.DB_PASSWORD,
    port: 5432,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Drop old constraint
    await client.query(`
      ALTER TABLE order_items 
      DROP CONSTRAINT IF EXISTS order_items_service_type_check
    `);
    console.log('✅ Dropped old constraint');

    // Add new constraint with EXPRESS included
    await client.query(`
      ALTER TABLE order_items
      ADD CONSTRAINT order_items_service_type_check 
      CHECK (service_type IN ('wash', 'iron', 'express', 'WASH', 'IRON', 'EXPRESS'))
    `);
    console.log('✅ Added new constraint with EXPRESS support');

    // Add comment
    await client.query(`
      COMMENT ON COLUMN order_items.service_type IS 'Service type: wash (normal), iron (ironing only), or express (urgent - double price)'
    `);
    console.log('✅ Added column comment');

    console.log('\n🎉 Migration completed successfully!');
    console.log('   EXPRESS service type is now supported in order_items table');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();

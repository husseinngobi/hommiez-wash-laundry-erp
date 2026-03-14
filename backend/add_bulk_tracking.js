const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Refusing to use hardcoded credentials.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Adding bulk message tracking columns...');
    
    await client.query(`
      -- Add bulk message tracking columns to whatsapp_messages table
      ALTER TABLE whatsapp_messages 
      ADD COLUMN IF NOT EXISTS is_bulk BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS campaign_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS recipient_count INTEGER DEFAULT 1;
    `);
    
    console.log('✅ Creating indexes...');
    await client.query(`
      -- Add index for bulk message queries
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_is_bulk ON whatsapp_messages(is_bulk);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_campaign ON whatsapp_messages(campaign_name) WHERE campaign_name IS NOT NULL;
    `);
    
    console.log('✅ Adding comments...');
    await client.query(`
      -- Add comment
      COMMENT ON COLUMN whatsapp_messages.is_bulk IS 'True if this message was part of a bulk campaign (same message to multiple recipients)';
      COMMENT ON COLUMN whatsapp_messages.campaign_name IS 'Name of the bulk campaign if applicable (e.g., "Weekend Special", "New Year Promo")';
      COMMENT ON COLUMN whatsapp_messages.recipient_count IS 'Total number of recipients in the campaign (for first message in bulk send)';
    `);
    
    console.log('✅ Bulk message tracking columns added successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);

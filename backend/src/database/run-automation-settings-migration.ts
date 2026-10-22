import pool from '../config/database';

async function runMigration() {
  console.log('🚀 Running automation settings migration...');
  
  try {
    // Create automation_settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS automation_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value BOOLEAN NOT NULL DEFAULT false,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER REFERENCES users(id)
      );
    `);
    console.log('✅ Table created: automation_settings');

    // Insert default automation settings
    await pool.query(`
      INSERT INTO automation_settings (setting_key, setting_value, description) VALUES
        ('whatsapp_auto_send_receipt', true, 'Automatically send WhatsApp receipt when order is created'),
        ('whatsapp_auto_send_ready', true, 'Automatically send WhatsApp notification when order is ready'),
        ('whatsapp_auto_send_delivered', false, 'Automatically send WhatsApp confirmation when order is delivered')
      ON CONFLICT DO NOTHING;
    `);
    console.log('✅ Default settings inserted');

    // Create index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_automation_settings_key ON automation_settings(setting_key);
    `);
    console.log('✅ Index created');

    console.log('🎉 Automation settings migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

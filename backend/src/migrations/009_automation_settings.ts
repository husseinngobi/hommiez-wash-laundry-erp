import { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automation_settings (
      id SERIAL PRIMARY KEY,
      setting_key VARCHAR(100) UNIQUE NOT NULL,
      setting_value BOOLEAN NOT NULL DEFAULT false,
      description TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(id)
    );

    -- Insert default automation settings
    INSERT INTO automation_settings (setting_key, setting_value, description) VALUES
      ('whatsapp_auto_send_receipt', true, 'Automatically send WhatsApp receipt when order is created'),
      ('whatsapp_auto_send_ready', true, 'Automatically send WhatsApp notification when order is ready'),
      ('whatsapp_auto_send_delivered', false, 'Automatically send WhatsApp confirmation when order is delivered')
    ON CONFLICT DO NOTHING;

    CREATE INDEX idx_automation_settings_key ON automation_settings(setting_key);
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS automation_settings CASCADE;
  `);
}

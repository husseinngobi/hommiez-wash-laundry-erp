-- Create business_settings table for storing business configuration
CREATE TABLE IF NOT EXISTS business_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_business_settings_key ON business_settings(setting_key);

-- Insert default business information
INSERT INTO business_settings (setting_key, setting_value, updated_at)
VALUES 
  ('business_info', '{"name": "Lush Dry Cleaners & Laundromat", "phone": "+256 754 723 614", "email": "info@lushdrycleaners.ug", "location": "Kampala, Uganda", "address": "Plot 123, Kampala Road", "tin": ""}', NOW()),
  ('business_hours', '{"monday": {"open": "07:00", "close": "21:00", "closed": false}, "tuesday": {"open": "07:00", "close": "21:00", "closed": false}, "wednesday": {"open": "07:00", "close": "21:00", "closed": false}, "thursday": {"open": "07:00", "close": "21:00", "closed": false}, "friday": {"open": "07:00", "close": "21:00", "closed": false}, "saturday": {"open": "07:00", "close": "21:00", "closed": false}, "sunday": {"open": "09:00", "close": "15:00", "closed": false}}', NOW())
ON CONFLICT DO NOTHING;

COMMENT ON TABLE business_settings IS 'Stores business configuration including business info, hours, and other settings';
COMMENT ON COLUMN business_settings.setting_key IS 'Unique identifier for each setting (e.g., business_info, business_hours)';
COMMENT ON COLUMN business_settings.setting_value IS 'JSON value of the setting';

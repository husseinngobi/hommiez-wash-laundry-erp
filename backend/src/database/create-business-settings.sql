-- Create business_settings table
CREATE TABLE IF NOT EXISTS business_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default business hours
INSERT INTO business_settings (setting_key, setting_value)
VALUES (
  'business_hours',
  '{
    "monday": {"open": "07:00", "close": "21:00", "closed": false},
    "tuesday": {"open": "07:00", "close": "21:00", "closed": false},
    "wednesday": {"open": "07:00", "close": "21:00", "closed": false},
    "thursday": {"open": "07:00", "close": "21:00", "closed": false},
    "friday": {"open": "07:00", "close": "21:00", "closed": false},
    "saturday": {"open": "07:00", "close": "21:00", "closed": false},
    "sunday": {"open": "09:00", "close": "15:00", "closed": false}
  }'::jsonb
)
ON CONFLICT DO NOTHING;

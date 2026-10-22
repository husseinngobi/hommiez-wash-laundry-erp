-- Add VAT toggle setting to business_settings
-- Date: February 2, 2026
-- Purpose: Enable/disable VAT (18% Uganda standard) via Settings page

-- Add VAT setting with default OFF
INSERT INTO business_settings (setting_key, setting_value, updated_at)
VALUES (
  'vat_enabled',
  '{"enabled": false, "rate": 18}'::jsonb,
  NOW()
)
ON CONFLICT (tenant_id, setting_key)
DO UPDATE SET
  setting_value = '{"enabled": false, "rate": 18}'::jsonb,
  updated_at = NOW();

COMMENT ON COLUMN business_settings.setting_key IS 'Setting identifiers: vat_enabled (VAT toggle), business_hours, business_info';

-- Verify VAT setting was added
SELECT
  setting_key,
  setting_value,
  updated_at
FROM business_settings
WHERE setting_key = 'vat_enabled';

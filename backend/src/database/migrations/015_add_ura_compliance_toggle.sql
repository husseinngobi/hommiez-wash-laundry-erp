-- Migration: Add URA Compliance Toggle Setting
-- Description: Adds a master toggle to enable/disable URA tax compliance system
-- Date: 2025-01-16

-- Add ura_compliance_enabled setting (default: false since business not yet registered)
INSERT INTO business_settings (setting_key, setting_value, updated_at)
VALUES ('ura_compliance_enabled', 'false', NOW())
ON CONFLICT DO NOTHING;

-- Add comment explaining the setting
COMMENT ON COLUMN business_settings.setting_key IS 
  'Setting keys include: ura_compliance_enabled (master toggle for VAT/TIN/FDN system)';

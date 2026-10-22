-- Add URA-compliant business settings
INSERT INTO business_settings (setting_key, setting_value, updated_at) 
VALUES 
  ('business_tin', '""', NOW()),
  ('fiscal_device_number', '""', NOW()),
  ('business_address', '"Kampala, Uganda"', NOW()),
  ('business_phone', '"+256700000000"', NOW()),
  ('business_email', '"info@lushlaundry.com"', NOW()),
  ('vat_rate', '"18.00"', NOW()),
  ('enable_efris', '"false"', NOW()),
  ('invoice_prefix', '"INV"', NOW()),
  ('invoice_footer_text', '"Thank you for choosing Lush Laundry Services!"', NOW())
ON CONFLICT DO NOTHING;

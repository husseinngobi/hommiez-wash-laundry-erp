-- Household covers & mosquito nets
-- Wash = listed price | Ironing = half wash | Express = 2x wash (express_price NULL)
-- Run against your live DB, then refresh Price List.

INSERT INTO price_items (item_id, name, category, subcategory, unit, price, ironing_price, express_price, is_active)
VALUES
  ('h50', 'Armrest Covers', 'general', 'Furniture Covers', 'piece', 2000, 1000, NULL, TRUE),
  ('h51', 'Back and Seat Covers', 'general', 'Furniture Covers', 'piece', 2500, 1250, NULL, TRUE),
  ('h52', 'Mosquito Net (Big)', 'general', 'Bedding', 'piece', 3500, 1750, NULL, TRUE),
  ('h53', 'Mosquito Net (Medium)', 'general', 'Bedding', 'piece', 2500, 1250, NULL, TRUE),
  ('h54', 'Mosquito Net (Small)', 'general', 'Bedding', 'piece', 15000, 7500, NULL, TRUE),
  ('h55', 'Mosquito Net (Smallest)', 'general', 'Bedding', 'piece', 8000, 4000, NULL, TRUE),
  ('h56', 'Bed Cover (15,000)', 'general', 'Bedding', 'piece', 15000, 7500, NULL, TRUE),
  ('h57', 'Bed Cover (20,000)', 'general', 'Bedding', 'piece', 20000, 10000, NULL, TRUE),
  ('h58', 'Bed Cover (25,000)', 'general', 'Bedding', 'piece', 25000, 12500, NULL, TRUE),
  ('h59', 'Bed Cover (30,000)', 'general', 'Bedding', 'piece', 30000, 15000, NULL, TRUE),
  ('h60', 'Bed Cover (35,000)', 'general', 'Bedding', 'piece', 35000, 17500, NULL, TRUE),
  ('h61', 'Bed Cover (40,000)', 'general', 'Bedding', 'piece', 40000, 20000, NULL, TRUE),
  ('h62', 'Bed Cover (45,000)', 'general', 'Bedding', 'piece', 45000, 22500, NULL, TRUE)
ON CONFLICT (item_id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  subcategory = EXCLUDED.subcategory,
  unit = EXCLUDED.unit,
  price = EXCLUDED.price,
  ironing_price = EXCLUDED.ironing_price,
  express_price = NULL,
  is_active = TRUE,
  updated_at = NOW();

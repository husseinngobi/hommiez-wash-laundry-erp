-- ========================================
-- SEED PRICE ITEMS - COMPLETE Lush Laundry Service Catalog
-- Run this in Supabase SQL Editor
-- Total: 88 items (25 Gents + 26 Ladies + 31 General + 6 Kids)
-- ========================================

BEGIN;

-- Check if price items already exist
DO $$
DECLARE
    existing_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO existing_count FROM price_items;
    
    IF existing_count > 0 THEN
        RAISE NOTICE 'Found % existing price items. Aborting to prevent duplicates.', existing_count;
        RAISE EXCEPTION 'Price items already exist';
    END IF;
END $$;

-- Insert all 88 price items (COMPLETE CATALOG)
INSERT INTO price_items (item_id, name, category, subcategory, price, ironing_price, is_active) VALUES
-- ==================== GENTS (25 items) ====================
('g1', 'Men''s 2pc Suit', 'gents', NULL, 15000, 7500, true),
('g2', 'Men''s 3pc Suit', 'gents', NULL, 17000, 8500, true),
('g3', 'Trousers', 'gents', NULL, 7500, 3750, true),
('g4', 'Jeans', 'gents', NULL, 8000, 4000, true),
('g5', 'Trouser Linen', 'gents', NULL, 10000, 5000, true),
('g6', 'Coats', 'gents', NULL, 11000, 5500, true),
('g7', 'Coat Linen', 'gents', NULL, 13000, 6500, true),
('g8', 'Kanzu', 'gents', NULL, 10000, 5000, true),
('g9', 'Kaunda Suit', 'gents', NULL, 15000, 7500, true),
('g10', 'Track Suit', 'gents', NULL, 11000, 5500, true),
('g11', 'Coloured Shirts', 'gents', NULL, 6000, 3000, true),
('g12', 'White Shirts', 'gents', NULL, 7000, 3500, true),
('g13', 'Shirt Linen', 'gents', NULL, 9000, 4500, true),
('g14', 'T-shirt', 'gents', NULL, 6000, 3000, true),
('g15', 'Under Shirt', 'gents', NULL, 5000, 2500, true),
('g16', 'Tie', 'gents', NULL, 4000, 2000, true),
('g17', 'Shorts', 'gents', NULL, 4000, 2000, true),
('g18', 'Jacket', 'gents', NULL, 12000, 6000, true),
('g19', 'Kagero (Sweater)', 'gents', NULL, 22000, 11000, true),
('g20', 'Softcore', 'gents', NULL, 11000, 5500, true),
('g21', 'Under Short', 'gents', NULL, 5000, 2500, true),
('g22', 'Velvet Jacket', 'gents', NULL, 15000, 7500, true),
('g23', 'Jumper/Sweater', 'gents', NULL, 12000, 6000, true),
('g24', 'Kufi', 'gents', NULL, 3000, 1500, true),
('g25', 'Winter Coat', 'gents', NULL, 6000, 3000, true),

-- ==================== LADIES (26 items) ====================
('l1', 'Women''s Suit', 'ladies', NULL, 15000, 7500, true),
('l2', 'Casual/Romper', 'ladies', NULL, 10000, 5000, true),
('l3', 'Dress Long', 'ladies', NULL, 13000, 6500, true),
('l4', 'Dress Short', 'ladies', NULL, 10000, 5000, true),
('l5', 'Changing Gown (Beaded)', 'ladies', NULL, 15000, 7500, true),
('l6', 'Skirt (Ordinary)', 'ladies', NULL, 6000, 3000, true),
('l7', 'Skirt Long', 'ladies', NULL, 7000, 3500, true),
('l8', 'Blouse (Ordinary)', 'ladies', NULL, 8000, 4000, true),
('l9', 'Blouse (Silk)', 'ladies', NULL, 7000, 3500, true),
('l10', 'Dress Shirt', 'ladies', NULL, 10000, 5000, true),
('l11', 'Casual/Romper Suit', 'ladies', NULL, 14500, 7250, true),
('l12', 'Normal Shirt', 'ladies', NULL, 9500, 4750, true),
('l13', 'Gomesi-Hanger', 'ladies', NULL, 13000, 6500, true),
('l14', 'Gomesi-Silk', 'ladies', NULL, 16000, 8000, true),
('l15', 'Normal Burti', 'ladies', NULL, 10500, 5250, true),
('l16', 'Long Burti', 'ladies', NULL, 18000, 9000, true),
('l17', 'Kitanga Dress Long', 'ladies', NULL, 11000, 5500, true),
('l18', 'Kitanga Dress Short', 'ladies', NULL, 8000, 4000, true),
('l19', 'Indian Suar', 'ladies', NULL, 20000, 10000, true),
('l20', 'Bridal Gown (Small)', 'ladies', NULL, 50000, 25000, true),
('l21', 'Bridal Gown (Medium)', 'ladies', NULL, 60000, 30000, true),
('l22', 'Bridal Gown (Big)', 'ladies', NULL, 80000, 40000, true),
('l23', 'Bridal Gown (Beaded)', 'ladies', NULL, 100000, 50000, true),
('l24', 'Women Shirt', 'ladies', NULL, 6000, 3000, true),
('l25', 'Bra/Underwear', 'ladies', NULL, 10000, 5000, true),
('l26', 'Handbag', 'ladies', NULL, 7000, 3500, true),

-- ==================== GENERAL - Household Bedding (12 items) ====================
('h1', 'Bed Cover (Big)', 'general', 'Bedding', 25000, 12500, true),
('h2', 'Pillow/Duvet (Medium)', 'general', 'Bedding', 20000, 10000, true),
('h3', 'Duvet/Bed (Small)', 'general', 'Bedding', 15000, 7500, true),
('h4', 'Bed Sheet/Duvet (Small)', 'general', 'Bedding', 16000, 8000, true),
('h5', 'Blanket (Big)', 'general', 'Bedding', 44000, 22000, true),
('h6', 'Duvet (Medium)', 'general', 'Bedding', 35000, 17500, true),
('h7', 'Blanket (Small)', 'general', 'Bedding', 20000, 10000, true),
('h8', 'Bed Sheet (Pair)', 'general', 'Bedding', 11000, 5500, true),
('h9', 'Bed Sheet (Pair) Linen', 'general', 'Bedding', 13000, 6500, true),
('h22', 'Pillows', 'general', 'Bedding', 10000, 5000, true),
('h24', 'Mosquito Net', 'general', 'Bedding', 10000, 5000, true),
('h25', 'Pillow Cover (Pair)', 'general', 'Bedding', 6000, 3000, true),
('h50', 'Armrest Covers', 'general', 'Furniture Covers', 2000, 1000, true),
('h51', 'Back and Seat Covers', 'general', 'Furniture Covers', 2500, 1250, true),
('h52', 'Mosquito Net (Big)', 'general', 'Bedding', 3500, 1750, true),
('h53', 'Mosquito Net (Medium)', 'general', 'Bedding', 2500, 1250, true),
('h54', 'Mosquito Net (Small)', 'general', 'Bedding', 15000, 7500, true),
('h55', 'Mosquito Net (Smallest)', 'general', 'Bedding', 8000, 4000, true),
('h56', 'Bed Cover (15,000)', 'general', 'Bedding', 15000, 7500, true),
('h57', 'Bed Cover (20,000)', 'general', 'Bedding', 20000, 10000, true),
('h58', 'Bed Cover (25,000)', 'general', 'Bedding', 25000, 12500, true),
('h59', 'Bed Cover (30,000)', 'general', 'Bedding', 30000, 15000, true),
('h60', 'Bed Cover (35,000)', 'general', 'Bedding', 35000, 17500, true),
('h61', 'Bed Cover (40,000)', 'general', 'Bedding', 40000, 20000, true),
('h62', 'Bed Cover (45,000)', 'general', 'Bedding', 45000, 22500, true),

-- ==================== GENERAL - Bathroom (2 items) ====================
('h10', 'Bath Towel (Small)', 'general', 'Bathroom', 7500, 3750, true),
('h11', 'Bath Towel (Big)', 'general', 'Bathroom', 10000, 5000, true),

-- ==================== GENERAL - Carpets (4 items) ====================
('h12', 'Carpet Rug', 'general', 'Carpet', 22000, 11000, true),
('h13', 'Carpet (Small)', 'general', 'Carpet', 40000, 20000, true),
('h14', 'Carpet (Medium)', 'general', 'Carpet', 60000, 30000, true),
('h15', 'Carpet (Large)', 'general', 'Carpet', 100000, 50000, true),

-- ==================== GENERAL - Curtains (5 items) ====================
('h17', 'Curtain (Test/Net)', 'general', 'Curtains', 25000, 12500, true),
('h18', 'Curtain (Cotton&Top)', 'general', 'Curtains', 8000, 4000, true),
('h19', 'Curtain (Light)', 'general', 'Curtains', 15000, 7500, true),
('h20', 'Curtain Nets (Fancy)', 'general', 'Curtains', 15000, 7500, true),
('h21', 'Curtain Nets (Light)', 'general', 'Curtains', 10000, 5000, true),

-- ==================== GENERAL - Home Service (2 items) ====================
('h16', 'Chair/Auto Clean/Mop', 'general', 'Home Service', 100000, 0, true),
('h23', 'Rug', 'general', 'Home Service', 6000, 3000, true),

-- ==================== GENERAL - Special Items (6 items) ====================
('h26', 'Graduation Gown', 'general', 'Special', 12000, 6000, true),
('h27', 'Trampoline', 'general', 'Special', 8000, 4000, true),
('h28', 'Mask', 'general', 'Special', 4000, 2000, true),
('h29', 'Irregular Item', 'general', 'Special', 4000, 2000, true),
('h30', 'Tie', 'general', 'Special', 2000, 1000, true),
('h31', 'Sweater', 'general', 'Special', 5000, 2500, true),

-- ==================== KIDS (6 items) ====================
('k1', 'Kids Suit', 'kids', NULL, 6000, 3000, true),
('k2', 'Kids Dress', 'kids', NULL, 7000, 3500, true),
('k3', 'Kids Shirt', 'kids', NULL, 4500, 2250, true),
('k4', 'Kids Irregular', 'kids', NULL, 4500, 2250, true),
('k5', 'Kids Tie', 'kids', NULL, 2000, 1000, true),
('k6', 'Kids Sweater', 'kids', NULL, 5000, 2500, true);

COMMIT;

-- Verify the data
SELECT 
    category,
    subcategory,
    COUNT(*) as item_count,
    MIN(price) as lowest_price,
    MAX(price) as highest_price
FROM price_items
GROUP BY category, subcategory
ORDER BY category, subcategory;

-- Show summary
SELECT 
    '🎉 COMPLETE CATALOG LOADED!' as status,
    COUNT(*) as total_items,
    SUM(CASE WHEN category = 'gents' THEN 1 ELSE 0 END) as gents_items,
    SUM(CASE WHEN category = 'ladies' THEN 1 ELSE 0 END) as ladies_items,
    SUM(CASE WHEN category = 'general' THEN 1 ELSE 0 END) as general_items,
    SUM(CASE WHEN category = 'kids' THEN 1 ELSE 0 END) as kids_items
FROM price_items;

-- Show all items grouped by category
SELECT 
    item_id, 
    name, 
    category,
    subcategory,
    price as wash_and_iron_price,
    ironing_price as ironing_only_price
FROM price_items
ORDER BY category, item_id;

import pool from '../config/database';

type PriceSeedItem = {
  item_id: string;
  name: string;
  category: string;
  subcategory?: string;
  unit?: 'piece' | 'kg';
  price: number;
  ironing: number;
};

/**
 * Complete Price List Data from Lush Laundry actual pricing
 * All prices in UGX
 */

const completePriceData: PriceSeedItem[] = [
  // ==================== GENTS (25 items) ====================
  { item_id: 'g1', name: "Men's 2pc Suit", category: 'gents', price: 15000, ironing: 7500 },
  { item_id: 'g2', name: "Men's 3pc Suit", category: 'gents', price: 17000, ironing: 8500 },
  { item_id: 'g3', name: "Trousers", category: 'gents', price: 7500, ironing: 3750 },
  { item_id: 'g4', name: "Jeans", category: 'gents', price: 8000, ironing: 4000 },
  { item_id: 'g5', name: "Trouser Linen", category: 'gents', price: 10000, ironing: 5000 },
  { item_id: 'g6', name: "Coats", category: 'gents', price: 11000, ironing: 5500 },
  { item_id: 'g7', name: "Coat Linen", category: 'gents', price: 13000, ironing: 6500 },
  { item_id: 'g8', name: "Kanzu", category: 'gents', price: 10000, ironing: 5000 },
  { item_id: 'g9', name: "Kaunda Suit", category: 'gents', price: 15000, ironing: 7500 },
  { item_id: 'g10', name: "Track Suit", category: 'gents', price: 11000, ironing: 5500 },
  { item_id: 'g11', name: "Coloured Shirts", category: 'gents', price: 6000, ironing: 3000 },
  { item_id: 'g12', name: "White Shirts", category: 'gents', price: 7000, ironing: 3500 },
  { item_id: 'g13', name: "Shirt Linen", category: 'gents', price: 9000, ironing: 4500 },
  { item_id: 'g14', name: "T-shirt", category: 'gents', price: 6000, ironing: 3000 },
  { item_id: 'g15', name: "Under Shirt", category: 'gents', price: 5000, ironing: 2500 },
  { item_id: 'g16', name: "Tie", category: 'gents', price: 4000, ironing: 2000 },
  { item_id: 'g17', name: "Shorts", category: 'gents', price: 4000, ironing: 2000 },
  { item_id: 'g18', name: "Jacket", category: 'gents', price: 12000, ironing: 6000 },
  { item_id: 'g19', name: "Kagero (Sweater)", category: 'gents', price: 22000, ironing: 11000 },
  { item_id: 'g20', name: "Softcore", category: 'gents', price: 11000, ironing: 5500 },
  { item_id: 'g21', name: "Under Short", category: 'gents', price: 5000, ironing: 2500 },
  { item_id: 'g22', name: "Velvet Jacket", category: 'gents', price: 15000, ironing: 7500 },
  { item_id: 'g23', name: "Jumper/Sweater", category: 'gents', price: 12000, ironing: 6000 },
  { item_id: 'g24', name: "Kufi", category: 'gents', price: 3000, ironing: 1500 },
  { item_id: 'g25', name: "Winter Coat", category: 'gents', price: 6000, ironing: 3000 },

  // ==================== LADIES (26 items) ====================
  { item_id: 'l1', name: "Women's Suit", category: 'ladies', price: 15000, ironing: 7500 },
  { item_id: 'l2', name: "Casual/Romper", category: 'ladies', price: 10000, ironing: 5000 },
  { item_id: 'l3', name: "Dress Long", category: 'ladies', price: 13000, ironing: 6500 },
  { item_id: 'l4', name: "Dress Short", category: 'ladies', price: 10000, ironing: 5000 },
  { item_id: 'l5', name: "Changing Gown (Beaded)", category: 'ladies', price: 15000, ironing: 7500 },
  { item_id: 'l6', name: "Skirt (Ordinary)", category: 'ladies', price: 6000, ironing: 3000 },
  { item_id: 'l7', name: "Skirt Long", category: 'ladies', price: 7000, ironing: 3500 },
  { item_id: 'l8', name: "Blouse (Ordinary)", category: 'ladies', price: 8000, ironing: 4000 },
  { item_id: 'l9', name: "Blouse (Silk)", category: 'ladies', price: 7000, ironing: 3500 },
  { item_id: 'l10', name: "Dress Shirt", category: 'ladies', price: 10000, ironing: 5000 },
  { item_id: 'l11', name: "Casual/Romper Suit", category: 'ladies', price: 14500, ironing: 7250 },
  { item_id: 'l12', name: "Normal Shirt", category: 'ladies', price: 9500, ironing: 4750 },
  { item_id: 'l13', name: "Gomesi-Hanger", category: 'ladies', price: 13000, ironing: 6500 },
  { item_id: 'l14', name: "Gomesi-Silk", category: 'ladies', price: 16000, ironing: 8000 },
  { item_id: 'l15', name: "Normal Burti", category: 'ladies', price: 10500, ironing: 5250 },
  { item_id: 'l16', name: "Long Burti", category: 'ladies', price: 18000, ironing: 9000 },
  { item_id: 'l17', name: "Kitanga Dress Long", category: 'ladies', price: 11000, ironing: 5500 },
  { item_id: 'l18', name: "Kitanga Dress Short", category: 'ladies', price: 8000, ironing: 4000 },
  { item_id: 'l19', name: "Indian Suar", category: 'ladies', price: 20000, ironing: 10000 },
  { item_id: 'l20', name: "Bridal Gown (Small)", category: 'ladies', price: 50000, ironing: 25000 },
  { item_id: 'l21', name: "Bridal Gown (Medium)", category: 'ladies', price: 60000, ironing: 30000 },
  { item_id: 'l22', name: "Bridal Gown (Big)", category: 'ladies', price: 80000, ironing: 40000 },
  { item_id: 'l23', name: "Bridal Gown (Beaded)", category: 'ladies', price: 100000, ironing: 50000 },
  { item_id: 'l24', name: "Women Shirt", category: 'ladies', price: 6000, ironing: 3000 },
  { item_id: 'l25', name: "Bra/Underwear", category: 'ladies', price: 10000, ironing: 5000 },
  { item_id: 'l26', name: "Handbag", category: 'ladies', price: 7000, ironing: 3500 },

  // ==================== GENERAL - Household (25 items) ====================
  { item_id: 'h1', name: "Bed Cover (Big)", category: 'general', subcategory: 'Bedding', price: 25000, ironing: 12500 },
  { item_id: 'h2', name: "Pillow/Duvet (Medium)", category: 'general', subcategory: 'Bedding', price: 20000, ironing: 10000 },
  { item_id: 'h3', name: "Duvet/Bed (Small)", category: 'general', subcategory: 'Bedding', price: 15000, ironing: 7500 },
  { item_id: 'h4', name: "Bed Sheet/Duvet (Small)", category: 'general', subcategory: 'Bedding', price: 16000, ironing: 8000 },
  { item_id: 'h5', name: "Blanket (Big)", category: 'general', subcategory: 'Bedding', price: 44000, ironing: 22000 },
  { item_id: 'h6', name: "Duvet (Medium)", category: 'general', subcategory: 'Bedding', price: 35000, ironing: 17500 },
  { item_id: 'h7', name: "Blanket (Small)", category: 'general', subcategory: 'Bedding', price: 20000, ironing: 10000 },
  { item_id: 'h8', name: "Bed Sheet (Pair)", category: 'general', subcategory: 'Bedding', price: 11000, ironing: 5500 },
  { item_id: 'h9', name: "Bed Sheet (Pair) Linen", category: 'general', subcategory: 'Bedding', price: 13000, ironing: 6500 },
  { item_id: 'h10', name: "Bath Towel (Small)", category: 'general', subcategory: 'Bathroom', price: 7500, ironing: 3750 },
  { item_id: 'h11', name: "Bath Towel (Big)", category: 'general', subcategory: 'Bathroom', price: 10000, ironing: 5000 },
  { item_id: 'h12', name: "Carpet Rug", category: 'general', subcategory: 'Carpet', price: 22000, ironing: 11000 },
  { item_id: 'h13', name: "Carpet (Small)", category: 'general', subcategory: 'Carpet', price: 40000, ironing: 20000 },
  { item_id: 'h14', name: "Carpet (Medium)", category: 'general', subcategory: 'Carpet', price: 60000, ironing: 30000 },
  { item_id: 'h15', name: "Carpet (Large)", category: 'general', subcategory: 'Carpet', price: 100000, ironing: 50000 },
  { item_id: 'h16', name: "Chair/Auto Clean/Mop", category: 'general', subcategory: 'Home Service', price: 100000, ironing: 0 },
  { item_id: 'h17', name: "Curtain (Test/Net)", category: 'general', subcategory: 'Curtains', price: 25000, ironing: 12500 },
  { item_id: 'h18', name: "Curtain (Cotton&Top)", category: 'general', subcategory: 'Curtains', price: 8000, ironing: 4000 },
  { item_id: 'h19', name: "Curtain (Light)", category: 'general', subcategory: 'Curtains', price: 15000, ironing: 7500 },
  { item_id: 'h20', name: "Curtain Nets (Fancy)", category: 'general', subcategory: 'Curtains', price: 15000, ironing: 7500 },
  { item_id: 'h21', name: "Curtain Nets (Light)", category: 'general', subcategory: 'Curtains', price: 10000, ironing: 5000 },
  { item_id: 'h22', name: "Pillows", category: 'general', subcategory: 'Bedding', price: 10000, ironing: 5000 },
  { item_id: 'h23', name: "Rug", category: 'general', subcategory: 'Home Service', price: 6000, ironing: 3000 },
  { item_id: 'h24', name: "Mosquito Net", category: 'general', subcategory: 'Bedding', price: 10000, ironing: 5000 },
  { item_id: 'h25', name: "Pillow Cover (Pair)", category: 'general', subcategory: 'Bedding', price: 6000, ironing: 3000 },

  // Furniture covers & sized bed/mosquito nets
  { item_id: 'h50', name: 'Armrest Covers', category: 'general', subcategory: 'Furniture Covers', price: 2000, ironing: 1000 },
  { item_id: 'h51', name: 'Back and Seat Covers', category: 'general', subcategory: 'Furniture Covers', price: 2500, ironing: 1250 },
  { item_id: 'h52', name: 'Mosquito Net (Big)', category: 'general', subcategory: 'Bedding', price: 3500, ironing: 1750 },
  { item_id: 'h53', name: 'Mosquito Net (Medium)', category: 'general', subcategory: 'Bedding', price: 2500, ironing: 1250 },
  { item_id: 'h54', name: 'Mosquito Net (Small)', category: 'general', subcategory: 'Bedding', price: 15000, ironing: 7500 },
  { item_id: 'h55', name: 'Mosquito Net (Smallest)', category: 'general', subcategory: 'Bedding', price: 8000, ironing: 4000 },
  { item_id: 'h56', name: 'Bed Cover (15,000)', category: 'general', subcategory: 'Bedding', price: 15000, ironing: 7500 },
  { item_id: 'h57', name: 'Bed Cover (20,000)', category: 'general', subcategory: 'Bedding', price: 20000, ironing: 10000 },
  { item_id: 'h58', name: 'Bed Cover (25,000)', category: 'general', subcategory: 'Bedding', price: 25000, ironing: 12500 },
  { item_id: 'h59', name: 'Bed Cover (30,000)', category: 'general', subcategory: 'Bedding', price: 30000, ironing: 15000 },
  { item_id: 'h60', name: 'Bed Cover (35,000)', category: 'general', subcategory: 'Bedding', price: 35000, ironing: 17500 },
  { item_id: 'h61', name: 'Bed Cover (40,000)', category: 'general', subcategory: 'Bedding', price: 40000, ironing: 20000 },
  { item_id: 'h62', name: 'Bed Cover (45,000)', category: 'general', subcategory: 'Bedding', price: 45000, ironing: 22500 },

  // ==================== GENERAL - Special Items (6 items) ====================
  { item_id: 'h26', name: "Graduation Gown", category: 'general', subcategory: 'Special', price: 12000, ironing: 6000 },
  { item_id: 'h27', name: "Trampoline", category: 'general', subcategory: 'Special', price: 8000, ironing: 4000 },
  { item_id: 'h28', name: "Mask", category: 'general', subcategory: 'Special', price: 4000, ironing: 2000 },
  { item_id: 'h29', name: "Irregular Item", category: 'general', subcategory: 'Special', price: 4000, ironing: 2000 },
  { item_id: 'h30', name: "Tie", category: 'general', subcategory: 'Special', price: 2000, ironing: 1000 },
  { item_id: 'h31', name: "Sweater", category: 'general', subcategory: 'Special', price: 5000, ironing: 2500 },

  // ==================== KIDS (6 items) ====================
  { item_id: 'k1', name: "Kids Suit", category: 'kids', price: 6000, ironing: 3000 },
  { item_id: 'k2', name: "Kids Dress", category: 'kids', price: 7000, ironing: 3500 },
  { item_id: 'k3', name: "Kids Shirt", category: 'kids', price: 4500, ironing: 2250 },
  { item_id: 'k4', name: "Kids Irregular", category: 'kids', price: 4500, ironing: 2250 },
  { item_id: 'k5', name: "Kids Tie", category: 'kids', price: 2000, ironing: 1000 },
  { item_id: 'k6', name: "Kids Sweater", category: 'kids', price: 5000, ironing: 2500 },
];

const seedCompletePriceList = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Starting complete price list seeding...');
    console.log(`📋 Total items to seed: ${completePriceData.length}`);
    
    await client.query('BEGIN');
    
    // Clear existing price items
    await client.query('TRUNCATE TABLE price_items RESTART IDENTITY CASCADE');
    console.log('✅ Cleared existing price items');
    
    let successCount = 0;
    for (const item of completePriceData) {
      try {
        await client.query(`
          INSERT INTO price_items (item_id, name, category, subcategory, unit, price, ironing_price)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          item.item_id,
          item.name,
          item.category,
          item.subcategory || null,
          item.unit || 'piece',
          item.price,
          item.ironing
        ]);
        successCount++;
      } catch (err) {
        console.error(`❌ Failed to insert ${item.name}:`, err);
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`\n✅ Successfully seeded ${successCount}/${completePriceData.length} price items!`);
    console.log('\n📊 Breakdown:');
    console.log(`   - Gents: ${completePriceData.filter(i => i.category === 'gents').length} items`);
    console.log(`   - Ladies: ${completePriceData.filter(i => i.category === 'ladies').length} items`);
    console.log(`   - Household/General: ${completePriceData.filter(i => i.category === 'general').length} items`);
    console.log(`   - Kids: ${completePriceData.filter(i => i.category === 'kids').length} items`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

seedCompletePriceList()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

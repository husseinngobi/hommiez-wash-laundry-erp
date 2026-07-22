import pool from './src/config/database';

const seedPrices = async () => {
  const client = await pool.connect();
  
  try {
    console.log('💰 Seeding price items to Supabase...\n');
    
    await client.query('BEGIN');
    
    // Check if price items already exist
    const existingCheck = await client.query('SELECT COUNT(*) FROM price_items');
    const existingCount = parseInt(existingCheck.rows[0].count);
    
    if (existingCount > 0) {
      console.log(`⚠️  Found ${existingCount} existing price items`);
      console.log('❌ Aborting: Price items already exist. Delete them first if you want to re-seed.\n');
      return;
    }
    
    // Price items from your business (UGX prices)
    const priceItems = [
      // GENTS (15 items)
      { item_id: 'g1', name: "Men's 2pc Suit", category: 'gents', price: 15000, ironing: 7500 },
      { item_id: 'g2', name: "Men's 3pc Suit", category: 'gents', price: 17000, ironing: 8500 },
      { item_id: 'g3', name: "Trousers", category: 'gents', price: 7000, ironing: 3500 },
      { item_id: 'g4', name: "Jeans", category: 'gents', price: 8000, ironing: 4000 },
      { item_id: 'g5', name: "Trouser Linen", category: 'gents', price: 10000, ironing: 5000 },
      { item_id: 'g6', name: "Coats", category: 'gents', price: 11000, ironing: 5500 },
      { item_id: 'g7', name: "Coat Linen", category: 'gents', price: 13000, ironing: 6500 },
      { item_id: 'g8', name: "Kanzu", category: 'gents', price: 10000, ironing: 5000 },
      { item_id: 'g9', name: "Kaunda Suit", category: 'gents', price: 15000, ironing: 7500 },
      { item_id: 'g10', name: "Tracksuit", category: 'gents', price: 11000, ironing: 5500 },
      { item_id: 'g11', name: "Coloured Shirts", category: 'gents', price: 8000, ironing: 4000 },
      { item_id: 'g12', name: "White Shirts", category: 'gents', price: 7000, ironing: 3500 },
      { item_id: 'g13', name: "Shirt Linen", category: 'gents', price: 9000, ironing: 4500 },
      { item_id: 'g14', name: "T-shirt", category: 'gents', price: 6000, ironing: 3000 },
      { item_id: 'g15', name: "Under Shirt", category: 'gents', price: 5000, ironing: 2500 },
      
      // LADIES (10 items)
      { item_id: 'l1', name: "Women's Suit", category: 'ladies', price: 15000, ironing: 7500 },
      { item_id: 'l2', name: "Casual Wear", category: 'ladies', price: 10000, ironing: 5000 },
      { item_id: 'l3', name: "Dress Long", category: 'ladies', price: 15000, ironing: 7500 },
      { item_id: 'l4', name: "Dress Short", category: 'ladies', price: 10000, ironing: 5000 },
      { item_id: 'l5', name: "Changing Gown (Beaded)", category: 'ladies', price: 30000, ironing: 15000 },
      { item_id: 'l6', name: "Skirt (Pleated)", category: 'ladies', price: 6000, ironing: 3000 },
      { item_id: 'l7', name: "Skirt (Straight)", category: 'ladies', price: 7000, ironing: 3500 },
      { item_id: 'l8', name: "Blouse (Ordinary)", category: 'ladies', price: 5000, ironing: 2500 },
      { item_id: 'l9', name: "Blouse (Silk)", category: 'ladies', price: 7000, ironing: 3500 },
      { item_id: 'l10', name: "Dress Shirt", category: 'ladies', price: 10000, ironing: 5000 },
      
      // GENERAL - Bedding (7 items)
      { item_id: 'h1', name: "Bed Cover (Big)", category: 'general', subcategory: 'Bedding', price: 25000, ironing: 12500 },
      { item_id: 'h2', name: "Bed Cover/Duvet (Medium)", category: 'general', subcategory: 'Bedding', price: 20000, ironing: 10000 },
      { item_id: 'h3', name: "Bed Cover/Duvet (Small)", category: 'general', subcategory: 'Bedding', price: 15000, ironing: 7500 },
      { item_id: 'h4', name: "Blanket (Big)", category: 'general', subcategory: 'Bedding', price: 40000, ironing: 20000 },
      { item_id: 'h5', name: "Blanket (Medium)", category: 'general', subcategory: 'Bedding', price: 35000, ironing: 17500 },
      { item_id: 'h6', name: "Blanket (Small)", category: 'general', subcategory: 'Bedding', price: 30000, ironing: 15000 },
      { item_id: 'h7', name: "Bed Sheet (Pair)", category: 'general', subcategory: 'Bedding', price: 10000, ironing: 5000 },
      
      // GENERAL - Bathroom (3 items)
      { item_id: 'h8', name: "Bath Towel (Small)", category: 'general', subcategory: 'Bathroom', price: 7000, ironing: 3500 },
      { item_id: 'h9', name: "Bath Towel (Big)", category: 'general', subcategory: 'Bathroom', price: 10000, ironing: 5000 },
      { item_id: 'h10', name: "Bath Robe", category: 'general', subcategory: 'Bathroom', price: 14000, ironing: 7000 },
      
      // KIDS (5 items)
      { item_id: 'k1', name: "Baby Clothes", category: 'kids', price: 3000, ironing: 1500 },
      { item_id: 'k2', name: "Kids Dress", category: 'kids', price: 6000, ironing: 3000 },
      { item_id: 'k3', name: "Kids Shirt", category: 'kids', price: 4000, ironing: 2000 },
      { item_id: 'k4', name: "Kids Trousers", category: 'kids', price: 5000, ironing: 2500 },
      { item_id: 'k5', name: "School Uniform", category: 'kids', price: 8000, ironing: 4000 },
    ];
    
    console.log(`📝 Inserting ${priceItems.length} price items...\n`);
    
    let insertedCount = 0;
    for (const item of priceItems) {
      await client.query(`
        INSERT INTO price_items (item_id, name, category, subcategory, unit, price, ironing_price, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      `, [
        item.item_id, 
        item.name, 
        item.category, 
        item.subcategory || null, 
        item.unit || 'piece',
        item.price, 
        item.ironing
      ]);
      insertedCount++;
      
      // Progress indicator every 10 items
      if (insertedCount % 10 === 0) {
        console.log(`   ✅ Inserted ${insertedCount}/${priceItems.length} items...`);
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`\n✅ Successfully seeded ${insertedCount} price items!\n`);
    console.log('📊 Breakdown:');
    console.log('   • 15 Gents items (Men\'s suits, shirts, trousers, etc.)');
    console.log('   • 10 Ladies items (Dresses, skirts, blouses, etc.)');
    console.log('   • 10 General items (Bedding, towels, etc.)');
    console.log('   • 5 Kids items (School uniforms, baby clothes, etc.)');
    console.log('\n💡 These items will now appear in your Price List and New Order forms!\n');
    
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error.message);
    if (error.code === '23505') {
      console.error('   → Duplicate item_id found. Price items may already exist.');
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

// Run the seeding
seedPrices().catch(console.error);

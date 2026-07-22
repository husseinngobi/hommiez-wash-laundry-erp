import { query } from '../config/database';

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
 * SAFE TEST DATA SEEDING SCRIPT
 * - Preserves your Google OAuth admin account
 * - Uses auto-increment IDs (PostgreSQL SERIAL)
 * - Maintains relational integrity
 * - Safe to run multiple times (checks for existing data)
 * - Safe to clear before production deployment
 */

async function seedTestDataSafe() {
  try {
    console.log('🌱 Starting safe test data seeding...\n');

    // Check if we already have Google OAuth admin
    const existingAdmin = await query(`SELECT id, email FROM users WHERE auth_provider = 'GOOGLE' LIMIT 1`);
    const adminId = existingAdmin.rows[0]?.id;
    
    if (adminId) {
      console.log(`✅ Found existing Google OAuth admin: ${existingAdmin.rows[0].email}`);
      console.log(`   Using admin ID: ${adminId}\n`);
    } else {
      console.log('⚠️  No Google OAuth admin found. Please log in first!\n');
      return;
    }

    // 1. SEED PRICE ITEMS (Complete Lush Laundry Price List)
    console.log('📋 Seeding price items...');
    const priceCount = await query(`SELECT COUNT(*) as count FROM price_items`);
    
    if (parseInt(priceCount.rows[0].count) > 0) {
      console.log(`   ℹ️  Found ${priceCount.rows[0].count} existing price items. Skipping price seeding.`);
    } else {
      const priceItems: PriceSeedItem[] = [
        // GENTS (25 items)
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

        // LADIES (26 items)
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
        { item_id: 'l15', name: "Gomesi-Cotton", category: 'ladies', price: 13000, ironing: 6500 },
        { item_id: 'l16', name: "Gomesi-Lubugo", category: 'ladies', price: 16000, ironing: 8000 },
        { item_id: 'l17', name: "Kitenge Dress", category: 'ladies', price: 15000, ironing: 7500 },
        { item_id: 'l18', name: "Under Skirts", category: 'ladies', price: 8000, ironing: 4000 },
        { item_id: 'l19', name: "Busuti", category: 'ladies', price: 16000, ironing: 8000 },
        { item_id: 'l20', name: "Khangas (Pair)", category: 'ladies', price: 10000, ironing: 5000 },
        { item_id: 'l21', name: "Saree", category: 'ladies', price: 13000, ironing: 6500 },
        { item_id: 'l22', name: "Sweater", category: 'ladies', price: 12000, ironing: 6000 },
        { item_id: 'l23', name: "Track Suit", category: 'ladies', price: 11000, ironing: 5500 },
        { item_id: 'l24', name: "Busuuti", category: 'ladies', price: 11000, ironing: 5500 },
        { item_id: 'l25', name: "Pyjama Set", category: 'ladies', price: 12000, ironing: 6000 },
        { item_id: 'l26', name: "Jacket", category: 'ladies', price: 12000, ironing: 6000 },

        // GENERAL (Bedding & Household - 22 items)
        { item_id: 'h1', name: "Bed Cover (Big)", category: 'general', subcategory: 'Bedding', price: 25000, ironing: 12500 },
        { item_id: 'h2', name: "Bed Cover/Duvet (Medium)", category: 'general', subcategory: 'Bedding', price: 20000, ironing: 10000 },
        { item_id: 'h3', name: "Bed Cover/Duvet (Small)", category: 'general', subcategory: 'Bedding', price: 15000, ironing: 7500 },
        { item_id: 'h4', name: "Blanket (Big)", category: 'general', subcategory: 'Bedding', price: 40000, ironing: 20000 },
        { item_id: 'h5', name: "Blanket (Medium)", category: 'general', subcategory: 'Bedding', price: 35000, ironing: 17500 },
        { item_id: 'h6', name: "Blanket (Small)", category: 'general', subcategory: 'Bedding', price: 30000, ironing: 15000 },
        { item_id: 'h7', name: "Bed Sheet (Pair)", category: 'general', subcategory: 'Bedding', price: 10000, ironing: 5000 },
        { item_id: 'h8', name: "Pillow Cases (Pair)", category: 'general', subcategory: 'Bedding', price: 6000, ironing: 3000 },
        { item_id: 'h9', name: "Bath Towel (Small)", category: 'general', subcategory: 'Bathroom', price: 7000, ironing: 3500 },
        { item_id: 'h10', name: "Bath Towel (Big)", category: 'general', subcategory: 'Bathroom', price: 10000, ironing: 5000 },
        { item_id: 'h11', name: "Bath Robe", category: 'general', subcategory: 'Bathroom', price: 14000, ironing: 7000 },
        { item_id: 'h12', name: "Curtains (Pair/Small)", category: 'general', subcategory: 'Household', price: 15000, ironing: 7500 },
        { item_id: 'h13', name: "Curtains (Pair/Medium)", category: 'general', subcategory: 'Household', price: 20000, ironing: 10000 },
        { item_id: 'h14', name: "Curtains (Pair/Big)", category: 'general', subcategory: 'Household', price: 25000, ironing: 12500 },
        { item_id: 'h15', name: "Table Cloth", category: 'general', subcategory: 'Household', price: 8000, ironing: 4000 },
        { item_id: 'h16', name: "Sofa Set Covers (Small)", category: 'general', subcategory: 'Household', price: 30000, ironing: 15000 },
        { item_id: 'h17', name: "Sofa Set Covers (Big)", category: 'general', subcategory: 'Household', price: 40000, ironing: 20000 },
        { item_id: 'h18', name: "Carpet (Small)", category: 'general', subcategory: 'Household', price: 20000, ironing: 10000 },
        { item_id: 'h19', name: "Carpet (Medium)", category: 'general', subcategory: 'Household', price: 30000, ironing: 15000 },
        { item_id: 'h20', name: "Carpet (Big)", category: 'general', subcategory: 'Household', price: 40000, ironing: 20000 },
        { item_id: 'h21', name: "Throw Pillow", category: 'general', subcategory: 'Household', price: 5000, ironing: 2500 },
        { item_id: 'h22', name: "Door Mat", category: 'general', subcategory: 'Household', price: 8000, ironing: 4000 },

        // KIDS (10 items)
        { item_id: 'k1', name: "Baby Clothes", category: 'kids', price: 3000, ironing: 1500 },
        { item_id: 'k2', name: "Kids Dress", category: 'kids', price: 6000, ironing: 3000 },
        { item_id: 'k3', name: "Kids Shirt", category: 'kids', price: 4000, ironing: 2000 },
        { item_id: 'k4', name: "Kids Trousers", category: 'kids', price: 5000, ironing: 2500 },
        { item_id: 'k5', name: "School Uniform", category: 'kids', price: 8000, ironing: 4000 },
        { item_id: 'k6', name: "Kids Track Suit", category: 'kids', price: 8000, ironing: 4000 },
        { item_id: 'k7', name: "Kids Jacket", category: 'kids', price: 7000, ironing: 3500 },
        { item_id: 'k8', name: "Kids Sweater", category: 'kids', price: 6000, ironing: 3000 },
        { item_id: 'k9', name: "Kids Shorts", category: 'kids', price: 3000, ironing: 1500 },
        { item_id: 'k10', name: "Baby Blanket", category: 'kids', price: 12000, ironing: 6000 },
      ];

      for (const item of priceItems) {
        await query(`
          INSERT INTO price_items (item_id, name, category, subcategory, unit, price, ironing_price, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
          ON CONFLICT (item_id) DO NOTHING
        `, [item.item_id, item.name, item.category, item.subcategory || null, item.unit || 'piece', item.price, item.ironing]);
      }
      console.log(`   ✅ Seeded ${priceItems.length} price items\n`);
    }

    // 2. SEED SAMPLE CUSTOMERS
    console.log('👥 Seeding sample customers...');
    const customerCount = await query(`SELECT COUNT(*) as count FROM customers`);
    
    if (parseInt(customerCount.rows[0].count) > 0) {
      console.log(`   ℹ️  Found ${customerCount.rows[0].count} existing customers. Skipping customer seeding.\n`);
    } else {
      const customers = [
        { customer_id: 'C001', name: 'Sarah Nakamya', phone: '+256701234567', email: 'sarah.n@email.com', location: 'Katete Zone A, Mbarara' },
        { customer_id: 'C002', name: 'John Mukasa', phone: '+256702345678', email: 'john.m@email.com', location: 'Kakoba Division, Mbarara' },
        { customer_id: 'C003', name: 'Grace Achieng', phone: '+256703456789', email: 'grace.a@email.com', location: 'Nyamitanga Zone 1, Mbarara' },
        { customer_id: 'C004', name: 'Royal Hotel Mbarara', phone: '+256704567890', email: 'info@royalhotel.com', location: 'High Street, Mbarara' },
        { customer_id: 'C005', name: 'Golden Guest House', phone: '+256705678901', email: 'booking@goldenguesthouse.com', location: 'Mbaguta Way, Mbarara' },
        { customer_id: 'C006', name: 'Mary Nambi', phone: '+256706789012', email: 'mary.n@email.com', location: 'Ruti Zone, Mbarara' },
        { customer_id: 'C007', name: 'David Wasswa', phone: '+256707890123', email: 'david.w@email.com', location: 'Biharwe Zone, Mbarara' },
        { customer_id: 'C008', name: 'Modern Clinic', phone: '+256708901234', email: 'admin@modernclinic.com', location: 'Station Road, Mbarara' },
      ];

      for (const customer of customers) {
        await query(`
          INSERT INTO customers (customer_id, name, phone, email, location, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        `, [customer.customer_id, customer.name, customer.phone, customer.email, customer.location]);
      }
      console.log(`   ✅ Seeded ${customers.length} customers\n`);
    }

    console.log('✅ Test data seeding complete!\n');
    console.log('📊 Summary:');
    console.log('   - Price Items: Ready for creating orders');
    console.log('   - Customers: Sample data available');
    console.log('   - Admin User: Your Google OAuth account preserved');
    console.log('\n💡 You can now:');
    console.log('   1. Create test orders in the New Order page');
    console.log('   2. Test payment workflows');
    console.log('   3. Verify financial calculations');
    console.log('   4. Test all reports and dashboards');
    console.log('\n⚠️  Before production: Run clear-all-data.ts to remove test data\n');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  seedTestDataSafe()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

export default seedTestDataSafe;

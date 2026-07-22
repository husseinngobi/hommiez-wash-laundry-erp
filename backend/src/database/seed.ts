import pool from '../config/database';
import bcrypt from 'bcryptjs';

const seed = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Starting database seeding...');
    
    await client.query('BEGIN');
    
    // 1. Create Admin User
    const hashedPassword = await bcrypt.hash('Admin123!', 10);
    const adminResult = await client.query(`
      INSERT INTO users (email, password, full_name, phone, role, status)
      VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE')
      RETURNING id
    `, ['admin@lushlaundry.com', hashedPassword, 'System Administrator', '+256 700 000 000']);
    
    const adminId = adminResult.rows[0].id;
    console.log('✅ Created admin user');
    
    // 2. Create sample users
    const userPassword = await bcrypt.hash('User123!', 10);
    await client.query(`
      INSERT INTO users (email, password, full_name, phone, role, status, created_by)
      VALUES 
        ($1, $2, 'Jane Nambi', '+256 701 111 111', 'USER', 'ACTIVE', $3),
        ($1, $2, 'Moses Okello', '+256 702 222 222', 'USER', 'ACTIVE', $3),
        ($1, $2, 'Sarah Mutesi', '+256 703 333 333', 'USER', 'PENDING', $3)
    `, ['user@lushlaundry.com', userPassword, adminId]);
    console.log('✅ Created sample users');
    
    // 3. Seed Price Items (from your mock data)
    const priceItems = [
      // GENTS
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
      
      // LADIES
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
      
      // GENERAL (Household)
      { item_id: 'h1', name: "Bed Cover (Big)", category: 'general', subcategory: 'Bedding', price: 25000, ironing: 12500 },
      { item_id: 'h2', name: "Bed Cover/Duvet (Medium)", category: 'general', subcategory: 'Bedding', price: 20000, ironing: 10000 },
      { item_id: 'h3', name: "Bed Cover/Duvet (Small)", category: 'general', subcategory: 'Bedding', price: 15000, ironing: 7500 },
      { item_id: 'h4', name: "Blanket (Big)", category: 'general', subcategory: 'Bedding', price: 40000, ironing: 20000 },
      { item_id: 'h5', name: "Blanket (Medium)", category: 'general', subcategory: 'Bedding', price: 35000, ironing: 17500 },
      { item_id: 'h6', name: "Blanket (Small)", category: 'general', subcategory: 'Bedding', price: 30000, ironing: 15000 },
      { item_id: 'h7', name: "Bed Sheet (Pair)", category: 'general', subcategory: 'Bedding', price: 10000, ironing: 5000 },
      { item_id: 'h8', name: "Bath Towel (Small)", category: 'general', subcategory: 'Bathroom', price: 7000, ironing: 3500 },
      { item_id: 'h9', name: "Bath Towel (Big)", category: 'general', subcategory: 'Bathroom', price: 10000, ironing: 5000 },
      { item_id: 'h10', name: "Bath Robe", category: 'general', subcategory: 'Bathroom', price: 14000, ironing: 7000 },
      
      // KIDS
      { item_id: 'k1', name: "Baby Clothes", category: 'kids', price: 3000, ironing: 1500 },
      { item_id: 'k2', name: "Kids Dress", category: 'kids', price: 6000, ironing: 3000 },
      { item_id: 'k3', name: "Kids Shirt", category: 'kids', price: 4000, ironing: 2000 },
      { item_id: 'k4', name: "Kids Trousers", category: 'kids', price: 5000, ironing: 2500 },
      { item_id: 'k5', name: "School Uniform", category: 'kids', price: 8000, ironing: 4000 },
    ];
    
    for (const item of priceItems) {
      await client.query(`
        INSERT INTO price_items (item_id, name, category, subcategory, unit, price, ironing_price)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [item.item_id, item.name, item.category, item.subcategory || null, item.unit || 'piece', item.price, item.ironing]);
    }
    console.log(`✅ Seeded ${priceItems.length} price items`);
    
    // 4. Seed Customers
    const customers = [
      { id: 'C001', name: 'Sarah Nakamya', phone: '+256 701 234 567', email: 'sarah@email.com', location: 'Kololo, Kampala' },
      { id: 'C002', name: 'John Mukasa', phone: '+256 702 345 678', email: 'john.m@email.com', location: 'Nakasero, Kampala' },
      { id: 'C003', name: 'Grace Achieng', phone: '+256 703 456 789', email: 'grace.a@email.com', location: 'Ntinda, Kampala' },
      { id: 'C004', name: 'Peter Ochieng', phone: '+256 704 567 890', email: 'peter@email.com', location: 'Bugolobi, Kampala' },
      { id: 'C005', name: 'Mary Nambi', phone: '+256 705 678 901', email: 'mary.n@email.com', location: 'Muyenga, Kampala' },
      { id: 'C006', name: 'David Wasswa', phone: '+256 706 789 012', email: 'david.w@email.com', location: 'Kisaasi, Kampala' },
      { id: 'C007', name: 'Rebecca Namutebi', phone: '+256 707 890 123', email: 'rebecca@email.com', location: 'Naguru, Kampala' },
      { id: 'C008', name: 'Samuel Kato', phone: '+256 708 901 234', email: 'samuel.k@email.com', location: 'Bukoto, Kampala' },
    ];
    
    for (const customer of customers) {
      await client.query(`
        INSERT INTO customers (customer_id, name, phone, email, location)
        VALUES ($1, $2, $3, $4, $5)
      `, [customer.id, customer.name, customer.phone, customer.email, customer.location]);
    }
    console.log(`✅ Seeded ${customers.length} customers`);
    
    // 5. Seed Sample Inventory Items
    const inventoryItems = [
      { name: 'Laundry Detergent', unit: 'kg', stock: 50, min: 10, price: 15000 },
      { name: 'Fabric Softener', unit: 'liters', stock: 30, min: 5, price: 12000 },
      { name: 'Bleach', unit: 'liters', stock: 20, min: 5, price: 8000 },
      { name: 'Hangers (Plastic)', unit: 'pieces', stock: 500, min: 100, price: 500 },
      { name: 'Hangers (Wire)', unit: 'pieces', stock: 300, min: 50, price: 300 },
      { name: 'Plastic Bags (Small)', unit: 'pieces', stock: 1000, min: 200, price: 200 },
      { name: 'Plastic Bags (Large)', unit: 'pieces', stock: 800, min: 150, price: 300 },
      { name: 'Starch', unit: 'kg', stock: 15, min: 3, price: 10000 },
    ];
    
    for (const item of inventoryItems) {
      await client.query(`
        INSERT INTO inventory_items (name, unit, current_stock, min_stock_level, unit_price)
        VALUES ($1, $2, $3, $4, $5)
      `, [item.name, item.unit, item.stock, item.min, item.price]);
    }
    console.log(`✅ Seeded ${inventoryItems.length} inventory items`);
    
    await client.query('COMMIT');
    console.log('✅ Database seeding completed successfully!');
    console.log('\n📝 Default Admin Credentials:');
    console.log('   Email: admin@lushlaundry.com');
    console.log('   Password: Admin123!');
    console.log('\n📝 Default User Credentials:');
    console.log('   Email: user@lushlaundry.com');
    console.log('   Password: User123!\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

// Run seed if this file is executed directly
if (require.main === module) {
  seed().catch(console.error);
}

export default seed;

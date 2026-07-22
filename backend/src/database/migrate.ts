import pool from '../config/database';

const migrate = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting database migration...');
    
    await client.query('BEGIN');
    
    // Drop existing tables (for development)
    await client.query(`
      DROP TABLE IF EXISTS order_items CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS price_items CASCADE;
      DROP TABLE IF EXISTS inventory_transactions CASCADE;
      DROP TABLE IF EXISTS inventory_items CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TYPE IF EXISTS user_role CASCADE;
      DROP TYPE IF EXISTS user_status CASCADE;
      DROP TYPE IF EXISTS order_status CASCADE;
      DROP TYPE IF EXISTS price_category CASCADE;
    `);
    
    // Create ENUM types
    await client.query(`
      CREATE TYPE user_role AS ENUM ('ADMIN', 'USER');
      CREATE TYPE user_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
      CREATE TYPE order_status AS ENUM ('pending', 'processing', 'ready', 'delivered', 'cancelled');
      CREATE TYPE price_category AS ENUM ('gents', 'ladies', 'general', 'home_services', 'kids');
    `);
    
    // Users table
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        role user_role DEFAULT 'USER',
        status user_status DEFAULT 'PENDING',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Customers table
    await client.query(`
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        customer_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        location TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Price Items table
    await client.query(`
      CREATE TABLE price_items (
        id SERIAL PRIMARY KEY,
        item_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        category price_category NOT NULL,
        subcategory VARCHAR(100),
        unit VARCHAR(20) NOT NULL DEFAULT 'piece',
        price INTEGER NOT NULL DEFAULT 0,
        ironing_price INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Orders table
    await client.query(`
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status order_status DEFAULT 'pending',
        due_date DATE,
        subtotal INTEGER NOT NULL DEFAULT 0,
        discount INTEGER NOT NULL DEFAULT 0,
        tax INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Order Items table
    await client.query(`
      CREATE TABLE order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        price_item_id INTEGER NOT NULL REFERENCES price_items(id) ON DELETE RESTRICT,
        service_type VARCHAR(10) NOT NULL CHECK (service_type IN ('wash', 'iron')),
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price INTEGER NOT NULL,
        total_price INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Inventory Items table
    await client.query(`
      CREATE TABLE inventory_items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        unit VARCHAR(50) NOT NULL,
        current_stock DECIMAL(10, 2) DEFAULT 0,
        min_stock_level DECIMAL(10, 2) DEFAULT 0,
        unit_price INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Inventory Transactions table
    await client.query(`
      CREATE TABLE inventory_transactions (
        id SERIAL PRIMARY KEY,
        inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('IN', 'OUT')),
        quantity DECIMAL(10, 2) NOT NULL,
        notes TEXT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create indexes for better performance
    await client.query(`
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_role ON users(role);
      CREATE INDEX idx_users_status ON users(status);
      CREATE INDEX idx_customers_customer_id ON customers(customer_id);
      CREATE INDEX idx_customers_phone ON customers(phone);
      CREATE INDEX idx_price_items_category ON price_items(category);
      CREATE INDEX idx_price_items_is_active ON price_items(is_active);
      CREATE INDEX idx_orders_customer_id ON orders(customer_id);
      CREATE INDEX idx_orders_user_id ON orders(user_id);
      CREATE INDEX idx_orders_status ON orders(status);
      CREATE INDEX idx_orders_created_at ON orders(created_at);
      CREATE INDEX idx_order_items_order_id ON order_items(order_id);
    `);
    
    // Create trigger for updating updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    
    await client.query(`
      CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_price_items_updated_at BEFORE UPDATE ON price_items
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON inventory_items
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
    
    await client.query('COMMIT');
    console.log('✅ Database migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  migrate().catch(console.error);
}

export default migrate;

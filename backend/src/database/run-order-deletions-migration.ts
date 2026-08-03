import { query } from '../config/database';

async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS order_deletions (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL,
      order_number VARCHAR(50),
      customer_id INTEGER,
      customer_name VARCHAR(255),
      total_amount INTEGER,
      amount_paid INTEGER,
      balance INTEGER,
      payment_status VARCHAR(20),
      status VARCHAR(20),
      created_at TIMESTAMP,
      cancelled_at TIMESTAMP,
      deleted_by INTEGER REFERENCES users(id),
      deleted_by_name VARCHAR(255),
      deletion_reason TEXT,
      order_items JSONB,
      payments JSONB,
      deleted_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ order_deletions table ready');
}

migrate().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
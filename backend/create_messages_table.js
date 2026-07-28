const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD,
});

const sql = `
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  message_text TEXT NOT NULL,
  message_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  whatsapp_message_id VARCHAR(100),
  cost_ugx DECIMAL(10,2) DEFAULT 193.00,
  sent_at TIMESTAMP DEFAULT NOW(),
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_customer_id ON whatsapp_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sent_at ON whatsapp_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_whatsapp_id ON whatsapp_messages(whatsapp_message_id);
`;

pool.query(sql)
  .then(() => {
    console.log('✅ whatsapp_messages table created successfully!');
    pool.end();
  })
  .catch((error) => {
    console.error('❌ Error creating table:', error);
    pool.end();
    process.exit(1);
  });

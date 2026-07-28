const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

pool.query('SELECT * FROM whatsapp_messages ORDER BY sent_at DESC LIMIT 10', (err, res) => {
  if (err) {
    console.error('❌ Error:', err.message);
  } else {
    console.log('\n=== WhatsApp Messages in Database ===');
    if (res.rows.length === 0) {
      console.log('❌ No messages found - this is why dashboard shows 0/0/0');
      console.log('\n💡 Solution: Backend needs restart to apply fixes');
    } else {
      console.log(`✅ Found ${res.rows.length} messages:`);
      res.rows.forEach(msg => {
        console.log(`\nID: ${msg.id}`);
        console.log(`Customer ID: ${msg.customer_id}`);
        console.log(`Phone: ${msg.phone_number}`);
        console.log(`Type: ${msg.message_type}`);
        console.log(`Status: ${msg.status}`);
        console.log(`Sent: ${msg.sent_at}`);
        console.log(`Twilio SID: ${msg.whatsapp_message_id}`);
      });
    }
  }
  pool.end();
});

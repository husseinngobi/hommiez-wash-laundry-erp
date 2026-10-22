import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'hommiez_wash',
});

async function mergeDuplicateCustomers() {
  console.log('\n═════════════════════════════════════════════════════════════════════');
  console.log('        🔀 DUPLICATE CUSTOMER MERGE UTILITY');
  console.log('═════════════════════════════════════════════════════════════════════\n');

  const client = await pool.connect();

  try {
    // Find duplicates with email "gracecollege@gmail.com"
    const duplicateEmail = 'gracecollege@gmail.com';
    
    console.log(`📧 Finding duplicate customers with email: ${duplicateEmail}\n`);
    
    const customersQuery = `
      SELECT id, customer_id, name, phone, email, created_at
      FROM customers
      WHERE email = $1
      ORDER BY created_at ASC
    `;
    
    const customers = await client.query(customersQuery, [duplicateEmail]);
    
    if (customers.rows.length < 2) {
      console.log('   ✅ No duplicates found for this email\n');
      return;
    }
    
    console.log(`   Found ${customers.rows.length} customers:\n`);
    
    for (const customer of customers.rows) {
      const orderCount = await client.query(
        'SELECT COUNT(*) as count FROM orders WHERE customer_id = $1',
        [customer.id]
      );
      
      console.log(`   ${customer.id}. ${customer.name} (${customer.customer_id})`);
      console.log(`      Created: ${new Date(customer.created_at).toLocaleDateString()}`);
      console.log(`      Phone: ${customer.phone || 'N/A'}`);
      console.log(`      Orders: ${orderCount.rows[0].count}`);
      console.log('');
    }
    
    // Keep the FIRST customer (oldest record) as primary
    const primaryCustomer = customers.rows[0];
    const duplicateCustomers = customers.rows.slice(1);
    
    console.log(`\n💡 MERGE PLAN:`);
    console.log(`   ✅ Keep: ${primaryCustomer.name} (ID: ${primaryCustomer.id}, ${primaryCustomer.customer_id})`);
    console.log(`   🔀 Merge from:`);
    duplicateCustomers.forEach(dup => {
      console.log(`      - ${dup.name} (ID: ${dup.id}, ${dup.customer_id})`);
    });
    console.log('');
    
    // Ask for confirmation (in production, use readline or auto-confirm)
    console.log('⚠️  This will:');
    console.log('   1. Move all orders from duplicate customers to primary customer');
    console.log('   2. Move all payments from duplicate customers to primary customer');
    console.log('   3. Delete duplicate customer records');
    console.log('');
    
    // Auto-proceed (remove this and add readline for manual confirmation)
    const proceed = true;
    
    if (!proceed) {
      console.log('❌ Merge cancelled\n');
      return;
    }
    
    await client.query('BEGIN');
    
    console.log('🔄 Starting merge process...\n');
    
    for (const duplicate of duplicateCustomers) {
      console.log(`   Processing duplicate: ${duplicate.name} (ID: ${duplicate.id})`);
      
      // 1. Update orders
      const orderUpdate = await client.query(
        'UPDATE orders SET customer_id = $1 WHERE customer_id = $2',
        [primaryCustomer.id, duplicate.id]
      );
      console.log(`      ✅ Moved ${orderUpdate.rowCount} orders`);
      
      // 2. Update payments
      const paymentUpdate = await client.query(
        'UPDATE payments SET customer_id = $1 WHERE customer_id = $2',
        [primaryCustomer.id, duplicate.id]
      );
      console.log(`      ✅ Moved ${paymentUpdate.rowCount} payments`);
      
      // 3. Update WhatsApp messages (if table exists and has customer_id)
      try {
        const whatsappUpdate = await client.query(
          'UPDATE whatsapp_messages SET customer_id = $1 WHERE customer_id = $2',
          [primaryCustomer.id, duplicate.id]
        );
        console.log(`      ✅ Moved ${whatsappUpdate.rowCount} WhatsApp messages`);
      } catch (error: any) {
        // Table or column might not exist
        console.log(`      ℹ️  Skipped WhatsApp messages (table/column not found)`);
      }
      
      // 4. Delete duplicate customer
      await client.query(
        'DELETE FROM customers WHERE id = $1',
        [duplicate.id]
      );
      console.log(`      ✅ Deleted duplicate customer record`);
      console.log('');
    }
    
    await client.query('COMMIT');
    
    console.log('═════════════════════════════════════════════════════════════════════');
    console.log('                 ✅ MERGE COMPLETED SUCCESSFULLY!');
    console.log('═════════════════════════════════════════════════════════════════════\n');
    
    // Show final result
    const finalOrderCount = await client.query(
      'SELECT COUNT(*) as count FROM orders WHERE customer_id = $1',
      [primaryCustomer.id]
    );
    
    console.log(`Primary Customer: ${primaryCustomer.name} (ID: ${primaryCustomer.id})`);
    console.log(`Total Orders: ${finalOrderCount.rows[0].count}`);
    console.log(`Duplicates Merged: ${duplicateCustomers.length}`);
    console.log('');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during merge:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

mergeDuplicateCustomers();

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

async function findDuplicateCustomers() {
  console.log('\n═════════════════════════════════════════════════════════════════════');
  console.log('        🔍 DUPLICATE CUSTOMER DETECTION & RESOLUTION UTILITY');
  console.log('═════════════════════════════════════════════════════════════════════\n');

  try {
    // 1. Find duplicate phone numbers
    console.log('📱 Checking for duplicate phone numbers...\n');
    
    const phoneQuery = `
      SELECT phone, COUNT(*) as count, ARRAY_AGG(id) as customer_ids, ARRAY_AGG(name) as names
      FROM customers
      WHERE phone IS NOT NULL AND phone != ''
      GROUP BY phone
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `;
    
    const phoneResult = await pool.query(phoneQuery);
    
    if (phoneResult.rows.length > 0) {
      console.log(`   ⚠️  Found ${phoneResult.rows.length} duplicate phone number(s):\n`);
      
      phoneResult.rows.forEach(row => {
        console.log(`   Phone: ${row.phone}`);
        console.log(`   Count: ${row.count} customers`);
        console.log(`   IDs: ${row.customer_ids.join(', ')}`);
        console.log(`   Names: ${row.names.join(', ')}`);
        console.log('');
      });
    } else {
      console.log('   ✅ No duplicate phone numbers found\n');
    }

    // 2. Find duplicate email addresses
    console.log('📧 Checking for duplicate email addresses...\n');
    
    const emailQuery = `
      SELECT email, COUNT(*) as count, ARRAY_AGG(id) as customer_ids, ARRAY_AGG(name) as names
      FROM customers
      WHERE email IS NOT NULL AND email != ''
      GROUP BY email
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `;
    
    const emailResult = await pool.query(emailQuery);
    
    if (emailResult.rows.length > 0) {
      console.log(`   ⚠️  Found ${emailResult.rows.length} duplicate email(s):\n`);
      
      emailResult.rows.forEach(row => {
        console.log(`   Email: ${row.email}`);
        console.log(`   Count: ${row.count} customers`);
        console.log(`   IDs: ${row.customer_ids.join(', ')}`);
        console.log(`   Names: ${row.names.join(', ')}`);
        console.log('');
      });
    } else {
      console.log('   ✅ No duplicate emails found\n');
    }

    // 3. Find similar names (potential duplicates with typos)
    console.log('👤 Checking for similar customer names (potential duplicates)...\n');
    
    const similarNameQuery = `
      SELECT c1.id as id1, c1.name as name1, c1.phone as phone1,
             c2.id as id2, c2.name as name2, c2.phone as phone2,
             SIMILARITY(c1.name, c2.name) as similarity
      FROM customers c1
      INNER JOIN customers c2 ON c1.id < c2.id
      WHERE SIMILARITY(c1.name, c2.name) > 0.6
      ORDER BY similarity DESC
      LIMIT 10
    `;
    
    try {
      const similarResult = await pool.query(similarNameQuery);
      
      if (similarResult.rows.length > 0) {
        console.log(`   ⚠️  Found ${similarResult.rows.length} potential similar names:\n`);
        
        similarResult.rows.forEach(row => {
          console.log(`   Customer 1: ${row.name1} (ID: ${row.id1}, Phone: ${row.phone1})`);
          console.log(`   Customer 2: ${row.name2} (ID: ${row.id2}, Phone: ${row.phone2})`);
          console.log(`   Similarity: ${(row.similarity * 100).toFixed(1)}%`);
          console.log('');
        });
      } else {
        console.log('   ✅ No similar names found\n');
      }
    } catch (error: any) {
      if (error.message.includes('pg_trgm') || error.message.includes('similarity')) {
        console.log('   ⚠️  pg_trgm extension not installed (optional feature)');
        console.log('   To enable similarity checks, run: CREATE EXTENSION pg_trgm;\n');
      } else {
        console.log(`   ⚠️  Similarity check skipped (${error.code})\n`);
      }
    }

    // 4. Get detailed analysis for manual review
    console.log('═════════════════════════════════════════════════════════════════════');
    console.log('                 📊 DUPLICATE CUSTOMER ANALYSIS');
    console.log('═════════════════════════════════════════════════════════════════════\n');

    if (phoneResult.rows.length > 0 || emailResult.rows.length > 0) {
      console.log('🔧 RECOMMENDED ACTIONS:\n');
      
      if (phoneResult.rows.length > 0) {
        for (const duplicate of phoneResult.rows) {
          const ids = duplicate.customer_ids;
          
          // Get order counts for each duplicate
          const orderCountsQuery = `
            SELECT customer_id, COUNT(*) as order_count, 
                   COALESCE(SUM(total_amount), 0) as total_spent,
                   MAX(created_at) as last_order
            FROM orders
            WHERE customer_id = ANY($1)
            GROUP BY customer_id
          `;
          
          const orderCounts = await pool.query(orderCountsQuery, [ids]);
          
          console.log(`\n   Phone: ${duplicate.phone}`);
          console.log('   ─────────────────────────────────────────────────────');
          
          ids.forEach((id: number, index: number) => {
            const orderInfo = orderCounts.rows.find(r => r.customer_id === id);
            const orderCount = orderInfo?.order_count || 0;
            const totalSpent = orderInfo?.total_spent || 0;
            const lastOrder = orderInfo?.last_order || 'Never';
            
            console.log(`\n   ${index + 1}. ${duplicate.names[index]} (ID: ${id})`);
            console.log(`      Orders: ${orderCount}`);
            console.log(`      Total Spent: UGX ${parseInt(totalSpent).toLocaleString()}`);
            console.log(`      Last Order: ${lastOrder === 'Never' ? lastOrder : new Date(lastOrder).toLocaleDateString()}`);
          });
          
          // Determine merge recommendation
          const primaryCandidate = orderCounts.rows.reduce((prev, current) => {
            return (current.order_count > prev.order_count) ? current : prev;
          }, { customer_id: ids[0], order_count: 0 });
          
          console.log(`\n   💡 RECOMMENDATION: Keep customer ID ${primaryCandidate.customer_id} (most orders)`);
          console.log(`      Merge orders from other customers to ID ${primaryCandidate.customer_id}`);
          console.log(`      Then delete duplicate customer records\n`);
        }
      }

      console.log('\n═════════════════════════════════════════════════════════════════════');
      console.log('                 ⚠️  MANUAL RESOLUTION REQUIRED');
      console.log('═════════════════════════════════════════════════════════════════════\n');
      
      console.log('To merge duplicate customers:');
      console.log('1. Review the recommendations above');
      console.log('2. Decide which customer record to keep (primary)');
      console.log('3. Run merge script (coming soon) or manual SQL:');
      console.log('');
      console.log('   -- Update orders to primary customer');
      console.log('   UPDATE orders SET customer_id = <primary_id> WHERE customer_id = <duplicate_id>;');
      console.log('');
      console.log('   -- Update payments to primary customer');
      console.log('   UPDATE payments SET customer_id = <primary_id> WHERE customer_id = <duplicate_id>;');
      console.log('');
      console.log('   -- Delete duplicate customer');
      console.log('   DELETE FROM customers WHERE id = <duplicate_id>;');
      console.log('');
      
    } else {
      console.log('✅ NO DUPLICATE CUSTOMERS FOUND!\n');
      console.log('   Your customer database is clean.\n');
    }

    console.log('═════════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error checking duplicates:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

findDuplicateCustomers();

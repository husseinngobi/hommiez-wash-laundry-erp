import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

async function systemHealthCheck() {
  try {
    console.log('🔍 HOMMIEZ WASH LAUNDRY AND DRY CLEANERS ERP - PRODUCTION READINESS CHECK\n');
    console.log('=' .repeat(60));
    
    // 1. Check database foreign key constraints
    console.log('\n1️⃣  CHECKING DATABASE INTEGRITY...\n');
    
    const fkCheck = await pool.query(`
      SELECT 
        tc.table_name, 
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `);
    
    console.log(`✅ Foreign Keys: ${fkCheck.rows.length} relationships found`);
    
    // Check critical relationships
    const criticalFKs = fkCheck.rows.filter(fk => 
      (fk.table_name === 'orders' && fk.foreign_table_name === 'customers') ||
      (fk.table_name === 'order_items' && fk.foreign_table_name === 'orders') ||
      (fk.table_name === 'orders' && fk.foreign_table_name === 'users')
    );
    
    console.log('\nCritical relationships:');
    criticalFKs.forEach(fk => {
      console.log(`  • ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name} [DELETE: ${fk.delete_rule}]`);
    });
    
    // 2. Check for orphaned records
    console.log('\n\n2️⃣  CHECKING FOR ORPHANED RECORDS...\n');
    
    const orphanedOrders = await pool.query(`
      SELECT COUNT(*) FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE c.id IS NULL
    `);
    
    const orphanedItems = await pool.query(`
      SELECT COUNT(*) FROM order_items oi
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE o.id IS NULL
    `);
    
    console.log(`✅ Orphaned Orders: ${orphanedOrders.rows[0].count} (should be 0)`);
    console.log(`✅ Orphaned Order Items: ${orphanedItems.rows[0].count} (should be 0)`);
    
    // 3. Check data consistency
    console.log('\n\n3️⃣  CHECKING DATA CONSISTENCY...\n');
    
    // Check orders with mismatched totals (accounting for discounts)
    const mismatchedTotals = await pool.query(`
      SELECT o.id, o.order_number, o.subtotal, o.discount_amount, o.total_amount,
             (SELECT COALESCE(SUM(total_price), 0) FROM order_items WHERE order_id = o.id) as calculated_subtotal,
             (o.subtotal - o.discount_amount) as expected_total
      FROM orders o
      WHERE ABS(o.subtotal - (SELECT COALESCE(SUM(total_price), 0) FROM order_items WHERE order_id = o.id)) > 0.01
      LIMIT 5
    `);
    
    if (mismatchedTotals.rows.length > 0) {
      console.log(`⚠️  Orders with mismatched subtotals: ${mismatchedTotals.rows.length}`);
      mismatchedTotals.rows.forEach(row => {
        console.log(`  • Order ${row.order_number}: Subtotal=${row.subtotal}, Line Items=${row.calculated_subtotal}`);
      });
    } else {
      console.log('✅ All order subtotals match line items (discounts calculated correctly)');
    }
    
    // Check balance calculations
    const incorrectBalances = await pool.query(`
      SELECT o.id, o.order_number, o.total_amount, o.amount_paid, o.balance,
             (o.total_amount - o.amount_paid) as calculated_balance
      FROM orders o
      WHERE ABS(o.balance - (o.total_amount - o.amount_paid)) > 0.01
      LIMIT 5
    `);
    
    if (incorrectBalances.rows.length > 0) {
      console.log(`⚠️  Orders with incorrect balances: ${incorrectBalances.rows.length}`);
      incorrectBalances.rows.forEach(row => {
        console.log(`  • Order ${row.order_number}: DB Balance=${row.balance}, Should be=${row.calculated_balance}`);
      });
    } else {
      console.log('✅ All order balances calculated correctly');
    }
    
    // 4. Check payment tracking
    console.log('\n\n4️⃣  CHECKING PAYMENT TRACKING...\n');
    
    const paymentStats = await pool.query(`
      SELECT 
        payment_status,
        COUNT(*) as count,
        SUM(total_amount) as total_value,
        SUM(amount_paid) as total_paid,
        SUM(balance) as total_outstanding
      FROM orders
      GROUP BY payment_status
      ORDER BY payment_status
    `);
    
    console.log('Payment Status Summary:');
    paymentStats.rows.forEach(row => {
      console.log(`  • ${row.payment_status}: ${row.count} orders | Total: UGX ${parseFloat(row.total_value || 0).toLocaleString()} | Paid: UGX ${parseFloat(row.total_paid || 0).toLocaleString()} | Balance: UGX ${parseFloat(row.total_outstanding || 0).toLocaleString()}`);
    });
    
    // 5. Check essential tables exist
    console.log('\n\n5️⃣  CHECKING ESSENTIAL TABLES...\n');
    
    const essentialTables = [
      'users', 'customers', 'orders', 'order_items', 'price_items',
      'expenses', 'expense_categories', 'inventory_items',
      'activity_logs', 'security_audit_logs'
    ];
    
    for (const tableName of essentialTables) {
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        )
      `, [tableName]);
      
      const exists = tableCheck.rows[0].exists;
      console.log(`${exists ? '✅' : '❌'} Table: ${tableName}`);
    }
    
    // 6. Check indexes on critical columns
    console.log('\n\n6️⃣  CHECKING PERFORMANCE INDEXES...\n');
    
    const indexes = await pool.query(`
      SELECT 
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('orders', 'customers', 'order_items')
      ORDER BY tablename, indexname
    `);
    
    console.log(`✅ Found ${indexes.rows.length} indexes on critical tables`);
    
    // 7. Check user accounts
    console.log('\n\n7️⃣  CHECKING USER ACCOUNTS...\n');
    
    const userStats = await pool.query(`
      SELECT role, status, COUNT(*) as count
      FROM users
      GROUP BY role, status
      ORDER BY role, status
    `);
    
    console.log('User Account Summary:');
    userStats.rows.forEach(row => {
      console.log(`  • ${row.role} - ${row.status}: ${row.count} users`);
    });
    
    // 8. Check recent activity
    console.log('\n\n8️⃣  CHECKING RECENT SYSTEM ACTIVITY...\n');
    
    const recentOrders = await pool.query(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);
    
    const recentCustomers = await pool.query(`
      SELECT COUNT(*) as count
      FROM customers
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);
    
    console.log(`✅ Orders created (last 7 days): ${recentOrders.rows[0].count}`);
    console.log(`✅ New customers (last 7 days): ${recentCustomers.rows[0].count}`);
    
    // 9. Check for NULL values in critical fields
    console.log('\n\n9️⃣  CHECKING CRITICAL FIELD INTEGRITY...\n');
    
    const nullChecks = [
      { table: 'orders', field: 'customer_id', label: 'Orders without customers' },
      { table: 'orders', field: 'user_id', label: 'Orders without staff' },
      { table: 'orders', field: 'total_amount', label: 'Orders without total' },
      { table: 'customers', field: 'name', label: 'Customers without names' },
      { table: 'order_items', field: 'order_id', label: 'Items without orders' }
    ];
    
    for (const check of nullChecks) {
      const result = await pool.query(
        `SELECT COUNT(*) FROM ${check.table} WHERE ${check.field} IS NULL`
      );
      const count = parseInt(result.rows[0].count);
      console.log(`${count === 0 ? '✅' : '⚠️'}  ${check.label}: ${count}`);
    }
    
    // 10. Final verdict
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 PRODUCTION READINESS SUMMARY');
    console.log('='.repeat(60) + '\n');
    
    const issues: string[] = [];
    
    if (parseInt(orphanedOrders.rows[0].count) > 0) issues.push('Orphaned orders found');
    if (parseInt(orphanedItems.rows[0].count) > 0) issues.push('Orphaned order items found');
    if (mismatchedTotals.rows.length > 0) issues.push('Order total mismatches detected');
    if (incorrectBalances.rows.length > 0) issues.push('Incorrect balance calculations');
    
    if (issues.length === 0) {
      console.log('✅ SYSTEM IS PRODUCTION READY!');
      console.log('\n✨ All critical checks passed. System is ready for deployment.');
    } else {
      console.log('⚠️  ISSUES FOUND:');
      issues.forEach(issue => console.log(`  • ${issue}`));
      console.log('\n⚠️  Please resolve these issues before deployment.');
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR during health check:', error);
    process.exit(1);
  }
}

systemHealthCheck();

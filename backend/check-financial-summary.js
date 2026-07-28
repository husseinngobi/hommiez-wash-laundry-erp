const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'lush_laundry',
  password: process.env.DB_PASSWORD,
  port: 5432,
});

async function checkFinancialSummary() {
  try {
    console.log('🔍 Checking financial_summary table...\n');
    
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'financial_summary'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ financial_summary table does NOT exist!');
      console.log('This explains why Financial Dashboard shows different numbers.');
      return;
    }
    
    console.log('✅ financial_summary table exists\n');
    
    // Check row count
    const countResult = await pool.query(`
      SELECT COUNT(*) as count FROM financial_summary;
    `);
    console.log(`📊 Total rows: ${countResult.rows[0].count}\n`);
    
    // Check January 2026 data
    const janData = await pool.query(`
      SELECT 
        summary_date,
        total_revenue,
        total_expenses,
        net_profit,
        orders_count
      FROM financial_summary 
      WHERE DATE_TRUNC('month', summary_date) = DATE_TRUNC('month', CURRENT_DATE)
      ORDER BY summary_date DESC
      LIMIT 10;
    `);
    
    console.log('📅 January 2026 data (last 10 days):');
    console.table(janData.rows);
    
    // Check what orders table shows
    const ordersData = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders_count,
        COALESCE(SUM(amount_paid), 0) as revenue
      FROM orders 
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 10;
    `);
    
    console.log('\n📦 Orders table - January 2026 (last 10 days):');
    console.table(ordersData.rows);
    
    // Compare totals
    const summaryTotal = await pool.query(`
      SELECT 
        COALESCE(SUM(total_revenue), 0) as total_revenue,
        COALESCE(SUM(orders_count), 0) as total_orders
      FROM financial_summary 
      WHERE DATE_TRUNC('month', summary_date) = DATE_TRUNC('month', CURRENT_DATE);
    `);
    
    const ordersTotal = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(amount_paid), 0) as total_revenue
      FROM orders 
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE);
    `);
    
    console.log('\n🔢 COMPARISON - This Month Totals:');
    console.log('\nFinancial Summary Table:');
    console.log(`  Revenue: UGX ${Number(summaryTotal.rows[0].total_revenue).toLocaleString()}`);
    console.log(`  Orders: ${summaryTotal.rows[0].total_orders}`);
    
    console.log('\nOrders Table (Direct):');
    console.log(`  Revenue: UGX ${Number(ordersTotal.rows[0].total_revenue).toLocaleString()}`);
    console.log(`  Orders: ${ordersTotal.rows[0].total_orders}`);
    
    const revenueDiff = Number(ordersTotal.rows[0].total_revenue) - Number(summaryTotal.rows[0].total_revenue);
    console.log(`\n⚠️ DIFFERENCE: UGX ${Math.abs(revenueDiff).toLocaleString()}`);
    
    if (Math.abs(revenueDiff) > 100) {
      console.log('\n❌ MISMATCH DETECTED! Financial summary table is OUTDATED or NOT BEING UPDATED!');
    } else {
      console.log('\n✅ Numbers match! Issue is elsewhere.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkFinancialSummary();

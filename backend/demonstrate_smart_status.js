const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function demonstrateSmartOrderStatus() {
  try {
    console.log('=== SMART ORDER STATUS TRACKING ===\n');
    
    // Current workflow status (always all-time)
    const currentWorkflow = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'ready') as ready
      FROM orders
    `);
    
    console.log('CURRENT WORKFLOW (Always All Orders):');
    console.log('  Pending:    ', currentWorkflow.rows[0].pending, 'orders (waiting to start)');
    console.log('  Processing: ', currentWorkflow.rows[0].processing, 'orders (being washed)');
    console.log('  Ready:      ', currentWorkflow.rows[0].ready, 'orders (ready for pickup)');
    console.log('');
    
    // Delivered by period
    console.log('DELIVERED (Filtered by Period):');
    
    const deliveredToday = await pool.query(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE status = 'delivered'
      AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = 
          DATE(NOW() AT TIME ZONE 'Africa/Nairobi')
    `);
    console.log('  Today:      ', deliveredToday.rows[0].count, 'orders delivered');
    
    const deliveredWeek = await pool.query(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE status = 'delivered'
      AND created_at >= NOW() AT TIME ZONE 'Africa/Nairobi' - INTERVAL '7 days'
    `);
    console.log('  This Week:  ', deliveredWeek.rows[0].count, 'orders delivered');
    
    const deliveredMonth = await pool.query(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE status = 'delivered'
      AND DATE_TRUNC('month', created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = 
          DATE_TRUNC('month', NOW() AT TIME ZONE 'Africa/Nairobi')
    `);
    console.log('  This Month: ', deliveredMonth.rows[0].count, 'orders delivered');
    
    const deliveredAllTime = await pool.query(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE status = 'delivered'
    `);
    console.log('  All Time:   ', deliveredAllTime.rows[0].count, 'orders delivered');
    console.log('');
    
    console.log('HOW IT WORKS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('PENDING, PROCESSING, READY:');
    console.log('  ✓ Always show current state');
    console.log('  ✓ Not affected by period selector');
    console.log('  ✓ These are "work in progress" - you need to see ALL of them');
    console.log('');
    console.log('DELIVERED:');
    console.log('  ✓ Filtered by period (Today/Week/Month/Year/All)');
    console.log('  ✓ Shows orders completed in selected timeframe');
    console.log('  ✓ Helps track productivity and performance');
    console.log('');
    console.log('EXAMPLE SCENARIOS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Scenario 1: Express Order Today');
    console.log('  9:00 AM  - Create order → PENDING (24 → 25)');
    console.log('  9:30 AM  - Start wash → PROCESSING (176 → 177, pending 25 → 24)');
    console.log('  11:00 AM - Done → READY (286 → 287, processing 177 → 176)');
    console.log('  2:00 PM  - Customer picks up → DELIVERED TODAY + 1');
    console.log('           (ready 287 → 286)');
    console.log('');
    console.log('Scenario 2: Old Order from Last Week');
    console.log('  Created: Jan 29');
    console.log('  Status: PENDING (still shows in pending count)');
    console.log('  If delivered today → Shows in "Delivered Today"');
    console.log('  If delivered last week → Shows in "Delivered This Week"');
    console.log('');
    console.log('DASHBOARD PERIOD SELECTOR AFFECTS:');
    console.log('  ✓ Orders Created (new orders in period)');
    console.log('  ✓ Revenue (cash collected in period)');
    console.log('  ✓ Delivered (orders completed in period)');
    console.log('  ✗ Pending/Processing/Ready (always current state)');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

demonstrateSmartOrderStatus();

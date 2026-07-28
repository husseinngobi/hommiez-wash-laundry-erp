const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function demonstrateOrderStatus() {
  try {
    console.log('=== ORDER STATUS TRACKING DEMONSTRATION ===\n');
    
    console.log('ORDER STATUS shows the CURRENT STATE of ALL orders in the system.\n');
    console.log('It does NOT filter by creation date - it shows workflow status.\n');
    
    // Current status counts
    const statusCounts = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM orders))::numeric, 1) as percentage
      FROM orders
      GROUP BY status
      ORDER BY 
        CASE status
          WHEN 'pending' THEN 1
          WHEN 'processing' THEN 2
          WHEN 'ready' THEN 3
          WHEN 'delivered' THEN 4
          WHEN 'cancelled' THEN 5
        END
    `);
    
    console.log('CURRENT ORDER STATUS (All Time):');
    console.log('┌──────────────┬────────┬────────────┐');
    console.log('│ Status       │ Count  │ Percentage │');
    console.log('├──────────────┼────────┼────────────┤');
    statusCounts.rows.forEach(row => {
      const status = row.status.toUpperCase().padEnd(12);
      const count = row.count.toString().padStart(6);
      const pct = (row.percentage + '%').padStart(10);
      console.log(`│ ${status} │ ${count} │ ${pct} │`);
    });
    console.log('└──────────────┴────────┴────────────┘\n');
    
    // Show examples of status changes
    console.log('EXAMPLE WORKFLOW:');
    console.log('1. Customer brings laundry → Status: PENDING (24 orders)');
    console.log('2. Start washing → Status: PROCESSING (176 orders)');
    console.log('3. Finished, ready for pickup → Status: READY (286 orders)');
    console.log('4. Customer picks up → Status: DELIVERED (2,225 orders)');
    console.log('5. Order cancelled → Status: CANCELLED (0 orders)\n');
    
    console.log('KEY POINTS:');
    console.log('✓ Order Status shows CURRENT state, not creation date');
    console.log('✓ An order from last week can still be PENDING today');
    console.log('✓ An order from today can already be DELIVERED');
    console.log('✓ Numbers change as you update order statuses in the system');
    console.log('✓ Period filter (Today/Week/Month) affects Orders/Revenue, NOT status counts\n');
    
    // Show orders that changed status recently
    const recentlyUpdated = await pool.query(`
      SELECT 
        order_number,
        status,
        created_at,
        updated_at,
        EXTRACT(EPOCH FROM (updated_at - created_at))/3600 as hours_to_update
      FROM orders
      WHERE updated_at > created_at
      ORDER BY updated_at DESC
      LIMIT 5
    `);
    
    if (recentlyUpdated.rows.length > 0) {
      console.log('RECENTLY UPDATED ORDERS (Status Changed):');
      recentlyUpdated.rows.forEach(order => {
        const hours = Math.round(order.hours_to_update);
        console.log(`  ${order.order_number}: ${order.status.toUpperCase()} (updated ${hours}h after creation)`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

demonstrateOrderStatus();

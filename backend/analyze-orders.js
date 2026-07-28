const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
});

async function analyzeOrders() {
  try {
    console.log('📊 Analyzing order patterns...\n');
    
    // Count orders by format
    const formatQuery = `
      SELECT 
        CASE 
          WHEN order_number LIKE 'ORD-________-___' THEN 'New Format (ORD-YYYYMMDD-NNN)'
          WHEN order_number LIKE 'ORD________' THEN 'Old Format (ORDYYYYNNNN)'
          ELSE 'Unknown Format'
        END as format_type,
        COUNT(*) as count,
        COUNT(CASE WHEN pickup_date IS NULL THEN 1 END) as null_pickup_dates
      FROM orders
      GROUP BY format_type
      ORDER BY count DESC;
    `;
    
    const formatResult = await pool.query(formatQuery);
    console.log('📋 Order Formats Distribution:');
    console.table(formatResult.rows);
    
    // Recent new format orders
    const recentNewFormat = `
      SELECT 
        id,
        order_number,
        pickup_date,
        created_at,
        order_status
      FROM orders
      WHERE order_number LIKE 'ORD-________-___'
      ORDER BY created_at DESC
      LIMIT 10;
    `;
    
    const recentResult = await pool.query(recentNewFormat);
    console.log('\n🆕 Recent New Format Orders (ORD-YYYYMMDD-NNN):');
    console.table(recentResult.rows);
    
    // Check if there's a pattern with NULL pickup dates
    const nullPatternQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN pickup_date IS NULL THEN 1 END) as null_pickup_count,
        ROUND(COUNT(CASE WHEN pickup_date IS NULL THEN 1 END)::decimal / COUNT(*) * 100, 2) as null_percentage
      FROM orders
      WHERE order_number LIKE 'ORD-________-___';
    `;
    
    const nullPatternResult = await pool.query(nullPatternQuery);
    console.log('\n⚠️  New Format Orders - NULL Pickup Date Analysis:');
    console.table(nullPatternResult.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

analyzeOrders();

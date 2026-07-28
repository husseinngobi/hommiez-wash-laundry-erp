const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function verifyOrderStatus() {
  try {
    console.log('=== ORDER STATUS VERIFICATION ===\n');
    
    // Check what status values actually exist in database
    const statusValuesResult = await pool.query(`
      SELECT DISTINCT status, COUNT(*) as count
      FROM orders
      GROUP BY status
      ORDER BY count DESC
    `);
    
    console.log('ACTUAL STATUS VALUES IN DATABASE:');
    statusValuesResult.rows.forEach(row => {
      console.log(`  ${row.status}: ${row.count} orders`);
    });
    console.log('');
    
    // Check lowercase queries (current implementation - WRONG)
    console.log('CURRENT QUERIES (lowercase - WRONG):');
    const pendingLower = await pool.query(`SELECT COUNT(*) as count FROM orders WHERE status = 'pending'`);
    const processingLower = await pool.query(`SELECT COUNT(*) as count FROM orders WHERE status = 'processing'`);
    const readyLower = await pool.query(`SELECT COUNT(*) as count FROM orders WHERE status = 'ready'`);
    
    console.log(`  Pending (lowercase): ${pendingLower.rows[0].count}`);
    console.log(`  Processing (lowercase): ${processingLower.rows[0].count}`);
    console.log(`  Ready (lowercase): ${readyLower.rows[0].count}`);
    console.log('');
    
    // Check uppercase queries (correct)
    console.log('CORRECT QUERIES (uppercase):');
    const pendingUpper = await pool.query(`SELECT COUNT(*) as count FROM orders WHERE status = 'PENDING'`);
    const processingUpper = await pool.query(`SELECT COUNT(*) as count FROM orders WHERE status = 'PROCESSING'`);
    const readyUpper = await pool.query(`SELECT COUNT(*) as count FROM orders WHERE status = 'READY'`);
    const deliveredUpper = await pool.query(`SELECT COUNT(*) as count FROM orders WHERE status = 'DELIVERED'`);
    const cancelledUpper = await pool.query(`SELECT COUNT(*) as count FROM orders WHERE status = 'CANCELLED'`);
    
    console.log(`  Pending: ${pendingUpper.rows[0].count}`);
    console.log(`  Processing: ${processingUpper.rows[0].count}`);
    console.log(`  Ready: ${readyUpper.rows[0].count}`);
    console.log(`  Delivered: ${deliveredUpper.rows[0].count}`);
    console.log(`  Cancelled: ${cancelledUpper.rows[0].count}`);
    console.log('');
    
    // Total check
    const totalResult = await pool.query(`SELECT COUNT(*) as count FROM orders`);
    console.log(`TOTAL ORDERS: ${totalResult.rows[0].count}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

verifyOrderStatus();

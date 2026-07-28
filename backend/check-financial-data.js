const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function checkData() {
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT 
        COALESCE(SUM(total_revenue), 0) as total_revenue,
        COALESCE(SUM(total_expenses), 0) as total_expenses,
        COALESCE(SUM(total_salaries), 0) as total_salaries,
        COALESCE(SUM(net_profit), 0) as net_profit,
        COUNT(DISTINCT summary_date) as days
      FROM financial_summary
      WHERE summary_date >= '2026-01-01' AND summary_date <= '2026-01-31'
    `);
    
    console.log('January 2026 Financial Data:');
    console.log('='.repeat(50));
    console.log(JSON.stringify(result.rows[0], null, 2));
    
    await client.end();
  } catch (error) {
    console.error('Error:', error.message);
    await client.end();
  }
}

checkData();

const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function updateFinancialSummary() {
  try {
    await client.connect();
    console.log('Recalculating net profit with salaries...\n');

    await client.query(`
      UPDATE financial_summary 
      SET net_profit = total_revenue - total_expenses - COALESCE(total_salaries, 0),
          updated_at = NOW()
    `);

    console.log('✓ Financial summary updated!\n');

    const result = await client.query(`
      SELECT 
        summary_date,
        total_revenue,
        total_expenses,
        total_salaries,
        net_profit
      FROM financial_summary 
      WHERE summary_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY summary_date DESC
      LIMIT 10
    `);

    console.log('Recent Financial Summary:');
    console.log('='.repeat(100));
    console.log('Date         Revenue      Expenses     Salaries     Net Profit');
    console.log('='.repeat(100));
    
    result.rows.forEach(row => {
      const date = row.summary_date.toISOString().slice(0, 10);
      const rev = parseInt(row.total_revenue || 0).toLocaleString().padStart(12);
      const exp = parseInt(row.total_expenses || 0).toLocaleString().padStart(12);
      const sal = parseInt(row.total_salaries || 0).toLocaleString().padStart(12);
      const profit = parseInt(row.net_profit || 0).toLocaleString().padStart(12);
      console.log(`${date}  ${rev}  ${exp}  ${sal}  ${profit}`);
    });

    console.log('='.repeat(100));
    console.log('\nFormula: Net Profit = Revenue - Expenses - Salaries\n');

    await client.end();
  } catch (error) {
    console.error('Error:', error.message);
    await client.end();
  }
}

updateFinancialSummary();

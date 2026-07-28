const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
});

async function checkFinancialData() {
  try {
    console.log('💰 Checking Financial Dashboard Data...\n');
    
    // Check financial_summary table
    console.log('1️⃣ Financial Summary Table:');
    const summaryQuery = `
      SELECT 
        summary_date,
        total_revenue,
        total_expenses,
        total_salaries,
        net_profit
      FROM financial_summary
      ORDER BY summary_date DESC
      LIMIT 10;
    `;
    const summaryResult = await pool.query(summaryQuery);
    console.table(summaryResult.rows);
    
    // Check orders by payment status
    console.log('\n2️⃣ Orders by Payment Status:');
    const orderStatusQuery = `
      SELECT 
        payment_status,
        COUNT(*) as order_count,
        SUM(total_amount) as total_amount,
        SUM(amount_paid) as amount_paid,
        SUM(balance) as balance
      FROM orders
      GROUP BY payment_status;
    `;
    const orderStatusResult = await pool.query(orderStatusQuery);
    console.table(orderStatusResult.rows);
    
    // Check expenses
    console.log('\n3️⃣ Expenses Data:');
    const expensesQuery = `
      SELECT 
        COUNT(*) as total_expenses,
        SUM(amount) as total_amount,
        COUNT(CASE WHEN approval_status = 'APPROVED' THEN 1 END) as approved_count
      FROM expenses;
    `;
    const expensesResult = await pool.query(expensesQuery);
    console.table(expensesResult.rows);
    
    // Check expense categories
    console.log('\n4️⃣ Expense Categories Breakdown:');
    const categoriesQuery = `
      SELECT 
        ec.category_name,
        COUNT(e.id) as expense_count,
        COALESCE(SUM(e.amount), 0) as total_amount
      FROM expense_categories ec
      LEFT JOIN expenses e ON ec.id = e.category_id AND e.approval_status = 'APPROVED'
      WHERE ec.is_active = true
      GROUP BY ec.category_name
      ORDER BY total_amount DESC;
    `;
    const categoriesResult = await pool.query(categoriesQuery);
    console.table(categoriesResult.rows);
    
    // Check salary payments
    console.log('\n5️⃣ Salary Payments:');
    const salariesQuery = `
      SELECT 
        COUNT(*) as payment_count,
        SUM(net_amount) as total_salaries
      FROM salary_payments
      WHERE payment_status = 'PAID';
    `;
    const salariesResult = await pool.query(salariesQuery);
    console.table(salariesResult.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkFinancialData();

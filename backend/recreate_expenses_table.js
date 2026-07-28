const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function recreateExpensesTable() {
  try {
    console.log('Dropping existing expenses table if exists...');
    await pool.query('DROP TABLE IF EXISTS expenses CASCADE');
    console.log('✅ Old table dropped');
    
    console.log('\nCreating expenses table...');
    await pool.query(`
      CREATE TABLE expenses (
        id SERIAL PRIMARY KEY,
        expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
        category VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50) DEFAULT 'CASH',
        receipt_number VARCHAR(100),
        
        submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMP,
        approval_notes TEXT,
        
        rejected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        rejected_at TIMESTAMP,
        rejection_reason TEXT,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT chk_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
      )
    `);
    console.log('✅ Expenses table created');
    
    console.log('\nCreating indexes...');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_submitted_by ON expenses(submitted_by)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_approved_by ON expenses(approved_by)');
    console.log('✅ Indexes created');
    
    console.log('\nInserting sample expenses...');
    await pool.query(`
      INSERT INTO expenses (expense_date, category, description, amount, payment_method, submitted_by, status)
      VALUES
        (CURRENT_DATE, 'Utilities', 'Electricity bill payment', 150000, 'MOBILE_MONEY', 5, 'PENDING'),
        (CURRENT_DATE - INTERVAL '1 day', 'Supplies', 'Detergent and soap purchase', 75000, 'CASH', 5, 'APPROVED'),
        (CURRENT_DATE - INTERVAL '2 days', 'Transport', 'Delivery fuel costs', 50000, 'CASH', 5, 'PENDING'),
        (CURRENT_DATE, 'Maintenance', 'Washing machine repair', 200000, 'CASH', 5, 'PENDING')
    `);
    console.log('✅ Sample expenses inserted');
    
    console.log('\n📊 Summary:');
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected,
        SUM(amount) as total_amount
      FROM expenses
    `);
    console.log(result.rows[0]);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

recreateExpensesTable();

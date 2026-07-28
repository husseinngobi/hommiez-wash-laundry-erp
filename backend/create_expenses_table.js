const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function createExpensesTable() {
  try {
    console.log('Creating expenses table...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS expenses (
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
    
    console.log('Creating indexes...');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_submitted_by ON expenses(submitted_by)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_approved_by ON expenses(approved_by)');
    
    console.log('✅ Indexes created');
    
    // Insert sample data
    console.log('Inserting sample expenses...');
    await pool.query(`
      INSERT INTO expenses (expense_date, category, description, amount, payment_method, submitted_by, status)
      VALUES
        (CURRENT_DATE, 'Utilities', 'Electricity bill payment', 150000, 'MOBILE_MONEY', 5, 'PENDING'),
        (CURRENT_DATE - INTERVAL '1 day', 'Supplies', 'Detergent and soap purchase', 75000, 'CASH', 5, 'APPROVED'),
        (CURRENT_DATE - INTERVAL '2 days', 'Transport', 'Fuel for delivery vehicle', 50000, 'CASH', 5, 'APPROVED'),
        (CURRENT_DATE - INTERVAL '3 days', 'Maintenance', 'Washing machine repair', 120000, 'CASH', 5, 'REJECTED')
      ON CONFLICT DO NOTHING
    `);
    
    console.log('✅ Sample data inserted');
    
    const result = await pool.query('SELECT COUNT(*) as count FROM expenses');
    console.log(`Total expenses in database: ${result.rows[0].count}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

createExpensesTable();

import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';

const runPayrollMigration = async () => {
  const client = await pool.connect();
  
  try {
    console.log('\n🏢 Running Payroll & Employee System Migration...\n');
    
    await client.query('BEGIN');
    
    // Read the SQL file
    const sqlPath = path.join(process.cwd(), 'src/database/migrations/add_payroll_system.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the migration
    await client.query(sql);
    const safeguardsPath = path.join(process.cwd(), 'src/database/migrations/add_payroll_payment_frequency_constraint.sql');
    await client.query(fs.readFileSync(safeguardsPath, 'utf8'));
    
    await client.query('COMMIT');
    
    console.log('✅ Payroll system migrated successfully\n');
    
    // Verify employees were created
    const employeesResult = await client.query(
      'SELECT employee_name, position, salary_amount, employment_status FROM payroll_employees ORDER BY id'
    );
    
    console.log('👥 EMPLOYEES CREATED:');
    console.log('═══════════════════════════════════════════════════════════');
    employeesResult.rows.forEach((emp, index) => {
      console.log(`${index + 1}. ${emp.employee_name.padEnd(20)} | ${emp.position.padEnd(20)} | UGX ${parseInt(emp.salary_amount).toLocaleString().padStart(10)} | ${emp.employment_status}`);
    });
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Verify salary payments
    const paymentsResult = await client.query(
      `SELECT COUNT(*) as count, SUM(net_amount) as total_paid 
       FROM salary_payments 
       WHERE payment_status = 'PAID'`
    );
    
    console.log('💰 SALARY PAYMENTS:');
    console.log(`   Payments processed: ${paymentsResult.rows[0].count}`);
    console.log(`   Total paid: UGX ${parseFloat(paymentsResult.rows[0].total_paid || 0).toLocaleString()}\n`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Payroll migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

runPayrollMigration();

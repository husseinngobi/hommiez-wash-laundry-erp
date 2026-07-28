const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function runPayrollMigration() {
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✓ Connected to lush_laundry database\n');

    console.log('Reading migration file...');
    const sqlFile = path.join(__dirname, 'src', 'database', 'migrations', 'add_payroll_system.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('Executing payroll migration...\n');
    await client.query(sql);

    console.log('✓ Payroll migration completed successfully!\n');
    console.log('Created:');
    console.log('  - payroll_employees table');
    console.log('  - salary_payments table');
    console.log('  - Updated financial_summary with total_salaries column');
    console.log('  - Created trigger for automatic financial updates');
    console.log('  - Added 3 test employees');
    console.log('  - Added January salary payments\n');

    // Show employee summary
    const employees = await client.query(`
      SELECT 
        employee_name, position, salary_amount, employment_status
      FROM payroll_employees
      ORDER BY salary_amount DESC
    `);

    console.log('Employees on Payroll:');
    console.log('='.repeat(60));
    employees.rows.forEach(emp => {
      console.log(`  ${emp.employee_name.padEnd(25)} ${emp.position.padEnd(20)} ${parseInt(emp.salary_amount).toLocaleString().padStart(10)} UGX`);
    });

    // Show January salaries
    const salaries = await client.query(`
      SELECT 
        pe.employee_name,
        sp.net_amount,
        sp.payment_method,
        sp.payment_status
      FROM salary_payments sp
      JOIN payroll_employees pe ON sp.employee_id = pe.id
      WHERE sp.payment_period = 'January 2026'
      ORDER BY sp.net_amount DESC
    `);

    console.log('\nJanuary 2026 Salary Payments:');
    console.log('='.repeat(60));
    let totalSalaries = 0;
    salaries.rows.forEach(sal => {
      console.log(`  ${sal.employee_name.padEnd(25)} ${parseInt(sal.net_amount).toLocaleString().padStart(10)} UGX  (${sal.payment_method})`);
      totalSalaries += parseFloat(sal.net_amount);
    });
    console.log('='.repeat(60));
    console.log(`  ${'TOTAL SALARIES'.padEnd(25)} ${totalSalaries.toLocaleString().padStart(10)} UGX\n`);

    await client.end();
    console.log('Next steps:');
    console.log('1. Restart your backend server');
    console.log('2. Refresh your browser');
    console.log('3. Check Financial Dashboard for updated profit calculations');
  } catch (error) {
    console.error('Migration error:', error);
    await client.end();
    process.exit(1);
  }
}

runPayrollMigration();

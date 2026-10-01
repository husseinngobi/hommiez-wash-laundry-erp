import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';

const run = async () => {
  const client = await pool.connect();

  try {
    const sqlPath = path.join(
      process.cwd(),
      'src/database/migrations/add_payroll_payment_frequency_constraint.sql'
    );

    await client.query('BEGIN');
    await client.query(fs.readFileSync(sqlPath, 'utf8'));
    await client.query('COMMIT');

    const result = await client.query(`
      SELECT
        t.tgname AS trigger_name,
        n.nspname AS schema_name,
        c.relname AS table_name
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal
        AND t.tgname IN (
          'payments_prevent_overpayment',
          'salary_payments_prevent_duplicate'
        )
      ORDER BY t.tgname
    `);

    console.log('Payment and payroll safeguards applied successfully.');
    console.table(result.rows);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to apply payment and payroll safeguards:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

run();

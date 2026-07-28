/**
 * Migration runner for refund system
 * Usage: node run_migration.js
 * Runs both refund support and approval workflow migrations
 */
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'lush_laundry',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD
});

const migrations = [
  { name: 'Refund Support', file: 'src/database/migrations/add_refund_support.sql' },
  { name: 'Refund Approval Workflow', file: 'src/database/migrations/add_refund_approval_workflow.sql' },
  { name: 'Per-Transaction Refund Support', file: 'src/database/migrations/add_per_transaction_refund_support.sql' },
];

async function run() {
  for (const migration of migrations) {
    try {
      if (!fs.existsSync(migration.file)) {
        console.log(`⏭️  Skipping ${migration.name} - file not found`);
        continue;
      }
      const sql = fs.readFileSync(migration.file, 'utf8');
      await pool.query(sql);
      console.log(`✅ ${migration.name} - completed`);
    } catch (err) {
      console.error(`❌ ${migration.name} - ${err.message}`);
    }
  }
  await pool.end();
  console.log('\nMigration run complete.');
}

run();

import { query } from '../config/database';

/**
 * Branch-based operations.
 *
 * A branch is an orthogonal dimension to tenant: staff are scoped to one branch
 * while administrators see and choose across all of them. Existing users and
 * orders are backfilled onto a single default branch so nothing breaks.
 */
export async function ensureBranchSupport(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      code VARCHAR(20) NOT NULL UNIQUE,
      phone VARCHAR(30),
      email VARCHAR(150),
      location VARCHAR(200),
      address TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    INSERT INTO branches (name, code, is_default)
    SELECT 'Main Branch', 'MAIN', TRUE
    WHERE NOT EXISTS (SELECT 1 FROM branches)
  `);

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id)`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id)`);

  await query(`
    UPDATE users SET branch_id = (SELECT id FROM branches ORDER BY is_default DESC, id ASC LIMIT 1)
    WHERE branch_id IS NULL
  `);
  await query(`
    UPDATE orders SET branch_id = (SELECT id FROM branches ORDER BY is_default DESC, id ASC LIMIT 1)
    WHERE branch_id IS NULL
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders (branch_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users (branch_id)`);

  console.log('✅ Branch support ready');
}

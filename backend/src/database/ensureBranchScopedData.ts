import { query } from '../config/database';

/**
 * Attach branch_id to expenses, inventory, and payroll so each branch
 * keeps its own operational records. Also marks historically entered orders.
 */
export async function ensureBranchScopedData(): Promise<void> {
  try {
    await query(`
      ALTER TABLE expenses
        ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL
    `);
    await query(`
      ALTER TABLE inventory_items
        ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL
    `);
    await query(`
      ALTER TABLE payroll_employees
        ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL
    `);
    await query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS is_backdated BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMP NULL
    `);

    await query(`
      UPDATE expenses
      SET branch_id = (SELECT id FROM branches ORDER BY is_default DESC, id ASC LIMIT 1)
      WHERE branch_id IS NULL
    `);
    await query(`
      UPDATE inventory_items
      SET branch_id = (SELECT id FROM branches ORDER BY is_default DESC, id ASC LIMIT 1)
      WHERE branch_id IS NULL
    `);
    await query(`
      UPDATE payroll_employees
      SET branch_id = (SELECT id FROM branches ORDER BY is_default DESC, id ASC LIMIT 1)
      WHERE branch_id IS NULL
    `);
    await query(`
      UPDATE orders
      SET recorded_at = created_at
      WHERE recorded_at IS NULL
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON expenses (branch_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_inventory_items_branch_id ON inventory_items (branch_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payroll_employees_branch_id ON payroll_employees (branch_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_orders_is_backdated ON orders (is_backdated)`);

    console.log('✅ ensureBranchScopedData: branch-scoped expenses/inventory/payroll + backdated orders ready');
  } catch (error) {
    console.error('❌ ensureBranchScopedData failed:', error);
  }
}

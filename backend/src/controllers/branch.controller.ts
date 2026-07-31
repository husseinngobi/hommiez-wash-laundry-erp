import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

const BRANCH_COLUMNS = `
  id, name, code, phone, email, location, address, is_active, is_default, created_at, updated_at
`;

function normalizeCode(name: string, code?: string): string {
  const source = (code && code.trim()) || name;
  return source
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 20) || 'BRANCH';
}

/** Every authenticated user can read branches (needed to label orders and receipts) */
export const getBranches = async (req: AuthRequest, res: Response) => {
  try {
    const { active } = req.query;

    let sql = `SELECT ${BRANCH_COLUMNS} FROM branches`;
    const values: any[] = [];
    if (active !== undefined) {
      sql += ' WHERE is_active = $1';
      values.push(active === 'true');
    }
    sql += ' ORDER BY is_default DESC, name ASC';

    const result = await query(sql, values);
    res.json({ branches: result.rows });
  } catch (error) {
    console.error('Get branches error:', error);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
};

/**
 * Per-branch trading figures. Only meaningful once a second branch exists —
 * the caller decides whether to show it.
 */
export const getBranchPerformance = async (req: AuthRequest, res: Response) => {
  try {
    const { from_date, to_date } = req.query;

    const values: any[] = [];
    let dateFilter = '';
    if (from_date) {
      values.push(from_date);
      dateFilter += ` AND o.created_at >= $${values.length}`;
    }
    if (to_date) {
      values.push(to_date);
      dateFilter += ` AND o.created_at <= $${values.length}`;
    }

    const result = await query(
      `SELECT
         b.id AS branch_id,
         b.name AS branch_name,
         b.code AS branch_code,
         b.is_active,
         COUNT(o.id) AS total_orders,
         COALESCE(SUM(COALESCE(o.total_amount, o.total, 0)), 0) AS total_billed,
         COALESCE(SUM(COALESCE(o.amount_paid, 0)), 0) AS total_collected,
         COALESCE(SUM(GREATEST(0, COALESCE(o.total_amount, o.total, 0) - COALESCE(o.amount_paid, 0))), 0) AS outstanding,
         COUNT(*) FILTER (WHERE LOWER(COALESCE(o.status, '')) = 'delivered') AS delivered_orders,
         COUNT(*) FILTER (WHERE o.payment_status IN ('UNPAID', 'PARTIAL')) AS unpaid_orders
       FROM branches b
       LEFT JOIN orders o
         ON o.branch_id = b.id
        AND LOWER(COALESCE(o.status, '')) <> 'cancelled'
        ${dateFilter}
       GROUP BY b.id, b.name, b.code, b.is_active
       ORDER BY total_billed DESC, b.name ASC`,
      values
    );

    const branches = result.rows.map((row) => ({
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      branch_code: row.branch_code,
      is_active: row.is_active,
      total_orders: Number(row.total_orders),
      total_billed: Number(row.total_billed),
      total_collected: Number(row.total_collected),
      outstanding: Number(row.outstanding),
      delivered_orders: Number(row.delivered_orders),
      unpaid_orders: Number(row.unpaid_orders),
      average_order_value:
        Number(row.total_orders) > 0
          ? Math.round(Number(row.total_billed) / Number(row.total_orders))
          : 0,
    }));

    res.json({
      branches,
      // The branch system stays dormant while there is only one branch
      multi_branch: branches.length > 1,
    });
  } catch (error) {
    console.error('Get branch performance error:', error);
    res.status(500).json({ error: 'Failed to fetch branch performance' });
  }
};

export const createBranch = async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, phone, email, location, address, is_default } = req.body;

    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return res.status(400).json({ error: 'Branch name is required' });
    }

    const duplicate = await query(
      'SELECT id FROM branches WHERE LOWER(TRIM(name)) = LOWER($1) LIMIT 1',
      [cleanName]
    );
    if (duplicate.rows.length > 0) {
      return res.status(409).json({ error: `A branch named "${cleanName}" already exists.` });
    }

    const cleanCode = normalizeCode(cleanName, code);
    const codeTaken = await query('SELECT id FROM branches WHERE code = $1 LIMIT 1', [cleanCode]);
    if (codeTaken.rows.length > 0) {
      return res.status(409).json({ error: `Branch code "${cleanCode}" is already in use.` });
    }

    if (is_default) {
      await query('UPDATE branches SET is_default = FALSE WHERE is_default = TRUE');
    }

    const result = await query(
      `INSERT INTO branches (name, code, phone, email, location, address, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${BRANCH_COLUMNS}`,
      [
        cleanName,
        cleanCode,
        phone || null,
        email || null,
        location || null,
        address || null,
        !!is_default,
      ]
    );

    res.status(201).json({ message: 'Branch created', branch: result.rows[0] });
  } catch (error) {
    console.error('Create branch error:', error);
    res.status(500).json({ error: 'Failed to create branch' });
  }
};

export const updateBranch = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, phone, email, location, address, is_active, is_default } = req.body;

    const existing = await query('SELECT id FROM branches WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (!cleanName) return res.status(400).json({ error: 'Branch name cannot be empty' });

      const duplicate = await query(
        'SELECT id FROM branches WHERE LOWER(TRIM(name)) = LOWER($1) AND id <> $2 LIMIT 1',
        [cleanName, id]
      );
      if (duplicate.rows.length > 0) {
        return res.status(409).json({ error: `Another branch is already named "${cleanName}".` });
      }
      updates.push(`name = $${paramCount++}`);
      values.push(cleanName);
    }

    if (code !== undefined) {
      const cleanCode = normalizeCode(String(name || code), code);
      const codeTaken = await query(
        'SELECT id FROM branches WHERE code = $1 AND id <> $2 LIMIT 1',
        [cleanCode, id]
      );
      if (codeTaken.rows.length > 0) {
        return res.status(409).json({ error: `Branch code "${cleanCode}" is already in use.` });
      }
      updates.push(`code = $${paramCount++}`);
      values.push(cleanCode);
    }

    for (const [field, value] of Object.entries({ phone, email, location, address })) {
      if (value !== undefined) {
        updates.push(`${field} = $${paramCount++}`);
        values.push(value || null);
      }
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(!!is_active);
    }

    if (is_default) {
      await query('UPDATE branches SET is_default = FALSE WHERE is_default = TRUE');
      updates.push(`is_default = $${paramCount++}`);
      values.push(true);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    values.push(id);

    const result = await query(
      `UPDATE branches SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING ${BRANCH_COLUMNS}`,
      values
    );

    res.json({ message: 'Branch updated', branch: result.rows[0] });
  } catch (error) {
    console.error('Update branch error:', error);
    res.status(500).json({ error: 'Failed to update branch' });
  }
};

export const deleteBranch = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const branch = await query('SELECT id, name, is_default FROM branches WHERE id = $1', [id]);
    if (branch.rows.length === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    if (branch.rows[0].is_default) {
      return res.status(409).json({ error: 'The default branch cannot be deleted.' });
    }

    const usage = await query(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE branch_id = $1) AS order_count,
         (SELECT COUNT(*) FROM users WHERE branch_id = $1) AS user_count`,
      [id]
    );
    const orderCount = parseInt(usage.rows[0].order_count, 10);
    const userCount = parseInt(usage.rows[0].user_count, 10);

    if (orderCount > 0 || userCount > 0) {
      await query('UPDATE branches SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
      return res.status(409).json({
        error: `"${branch.rows[0].name}" has ${orderCount} order(s) and ${userCount} staff member(s) attached, so it cannot be deleted. It has been deactivated instead.`,
        deactivated: true,
      });
    }

    await query('DELETE FROM branches WHERE id = $1', [id]);
    res.json({ message: 'Branch deleted', deleted: true });
  } catch (error) {
    console.error('Delete branch error:', error);
    res.status(500).json({ error: 'Failed to delete branch' });
  }
};

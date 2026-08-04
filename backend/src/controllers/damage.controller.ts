import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

/** GET /api/damage?order_id=  — list all claims (optionally filtered by order) */
export const getDamageClaims = async (req: AuthRequest, res: Response) => {
  try {
    const { order_id, status } = req.query;
    const params: any[] = [];
    const where: string[] = [];
    let p = 1;

    if (order_id) { where.push(`dc.order_id = $${p++}`); params.push(order_id); }
    if (status) { where.push(`dc.status = $${p++}`); params.push(status); }

    const sql = `
      SELECT dc.*, u.full_name as logged_by_name, r.full_name as resolved_by_name
      FROM damage_claims dc
      LEFT JOIN users u ON dc.logged_by = u.id
      LEFT JOIN users r ON dc.resolved_by = r.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY dc.created_at DESC
      LIMIT 200
    `;
    const result = await query(sql, params);
    res.json({ claims: result.rows });
  } catch (error) {
    console.error('getDamageClaims error:', error);
    res.status(500).json({ error: 'Failed to fetch damage claims' });
  }
};

/** POST /api/damage — log a new damage/loss claim */
export const createDamageClaim = async (req: AuthRequest, res: Response) => {
  try {
    const {
      order_id,
      order_number,
      customer_name,
      item_description,
      claim_type = 'DAMAGED',
      description,
      compensation_amount = 0,
    } = req.body;

    if (!order_id || !item_description) {
      return res.status(400).json({ error: 'order_id and item_description are required' });
    }

    const result = await query(
      `INSERT INTO damage_claims
         (order_id, order_number, customer_name, item_description, claim_type, description, compensation_amount, status, logged_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN',$8)
       RETURNING *`,
      [order_id, order_number || null, customer_name || null, item_description, claim_type, description || null, Number(compensation_amount) || 0, req.user!.id]
    );

    const claim = result.rows[0];

    // If a compensation amount is set, automatically create an expense record
    if (Number(compensation_amount) > 0) {
      try {
        await query(
          `INSERT INTO expenses
             (description, amount, category, expense_date, reference_number, approval_status, approved_by)
           VALUES ($1, $2, 'DAMAGE_COMPENSATION', NOW(), $3, 'APPROVED', $4)`,
          [
            `Damage/Loss compensation — ${item_description} (Order ${order_number || order_id})`,
            Number(compensation_amount),
            `CLAIM-${claim.id}`,
            req.user!.id,
          ]
        );
      } catch (expErr) {
        // Non-fatal: claim was created, expense creation failed (e.g., missing category constraint)
        console.error('Damage claim expense auto-creation failed:', expErr);
      }
    }

    res.status(201).json({ claim });
  } catch (error) {
    console.error('createDamageClaim error:', error);
    res.status(500).json({ error: 'Failed to log damage claim' });
  }
};

/** PATCH /api/damage/:id — update claim status / resolution notes */
export const updateDamageClaim = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes, compensation_amount } = req.body;

    const updates: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let p = 1;

    if (status) { updates.push(`status = $${p++}`); values.push(status); }
    if (resolution_notes !== undefined) { updates.push(`resolution_notes = $${p++}`); values.push(resolution_notes); }
    if (compensation_amount !== undefined) { updates.push(`compensation_amount = $${p++}`); values.push(Number(compensation_amount) || 0); }
    if (status === 'RESOLVED' || status === 'REJECTED') {
      updates.push(`resolved_by = $${p++}`);
      values.push(req.user!.id);
    }

    values.push(id);
    const result = await query(
      `UPDATE damage_claims SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Claim not found' });
    res.json({ claim: result.rows[0] });
  } catch (error) {
    console.error('updateDamageClaim error:', error);
    res.status(500).json({ error: 'Failed to update claim' });
  }
};

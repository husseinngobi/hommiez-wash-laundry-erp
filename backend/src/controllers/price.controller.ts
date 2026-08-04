import { Response } from 'express';
import { validationResult } from 'express-validator';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const getAllPrices = async (req: AuthRequest, res: Response) => {
  try {
    const { category, active } = req.query;
    
    let sql = `
      SELECT 
        *,
        CASE 
          WHEN discount_percentage > 0 
               AND discount_start_date <= NOW() 
               AND discount_end_date >= NOW()
          THEN ROUND(price * (1 - discount_percentage / 100))
          ELSE price
        END as effective_price,
        CASE 
          WHEN discount_percentage > 0 
               AND discount_start_date <= NOW() 
               AND discount_end_date >= NOW()
          THEN ROUND(ironing_price * (1 - discount_percentage / 100))
          ELSE ironing_price
        END as effective_ironing_price,
        CASE 
          WHEN express_price IS NOT NULL THEN express_price
          WHEN discount_percentage > 0 
               AND discount_start_date <= NOW() 
               AND discount_end_date >= NOW()
          THEN ROUND(price * (1 - discount_percentage / 100)) * 2
          ELSE price * 2
        END as effective_express_price,
        CASE 
          WHEN discount_percentage > 0 
               AND discount_start_date <= NOW() 
               AND discount_end_date >= NOW()
          THEN true
          ELSE false
        END as has_active_discount
      FROM price_items 
      WHERE 1=1
    `;
    const values: any[] = [];
    let paramCount = 1;
    
    if (category) {
      sql += ` AND category = $${paramCount++}`;
      values.push(category);
    }
    
    if (active !== undefined) {
      sql += ` AND is_active = $${paramCount++}`;
      values.push(active === 'true');
    }
    
    sql += ' ORDER BY category, name';
    
    const result = await query(sql, values);
    
    res.json({ prices: result.rows });
  } catch (error) {
    console.error('Get prices error:', error);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
};

export const getPriceById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      'SELECT * FROM price_items WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Price item not found' });
    }
    
    res.json({ price: result.rows[0] });
  } catch (error) {
    console.error('Get price error:', error);
    res.status(500).json({ error: 'Failed to fetch price' });
  }
};

const CATEGORY_PREFIX: Record<string, string> = {
  gents: 'g',
  ladies: 'l',
  general: 'h',
  kids: 'k',
  home_services: 'hs',
};

async function generateNextItemId(category: string): Promise<string> {
  const prefix = CATEGORY_PREFIX[category] || 'x';
  const result = await query(
    `SELECT item_id FROM price_items WHERE item_id ~ $1`,
    [`^${prefix}\\d+$`]
  );

  let max = 0;
  for (const row of result.rows) {
    const match = String(row.item_id).match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return `${prefix}${max + 1}`;
}

export const createPrice = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: errors.array().map((e: any) => e.msg).join('; '),
        errors: errors.array(),
      });
    }
    
    const { category, subcategory, unit = 'piece', price, express_price, pricing_type, price_per_kg } = req.body;
    let { item_id, ironing_price, name } = req.body;

    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (!name) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    // Item names must be unique (case/spacing insensitive) so the price list
    // never ends up with two "Doctor Suit" rows staff cannot tell apart.
    const duplicate = await query(
      `SELECT id, name, is_active FROM price_items
       WHERE LOWER(TRIM(name)) = LOWER($1) LIMIT 1`,
      [name]
    );
    if (duplicate.rows.length > 0) {
      const existing = duplicate.rows[0];
      return res.status(409).json({
        error: existing.is_active
          ? `"${existing.name}" already exists in the price list. Edit that item instead of adding it again.`
          : `"${existing.name}" already exists but is deactivated. Reactivate it instead of adding a duplicate.`,
        code: 'DUPLICATE_ITEM_NAME',
        existingId: existing.id,
        existingIsActive: existing.is_active,
      });
    }

    // Auto-generate item_id when not provided (UI expects this)
    if (!item_id || String(item_id).trim() === '') {
      item_id = await generateNextItemId(category);
    }

    // Default ironing to half wash price when omitted
    if (ironing_price === undefined || ironing_price === null || ironing_price === '') {
      ironing_price = Math.round(Number(price) / 2);
    }
    
    const resolvedPricingType = (pricing_type === 'PER_KG') ? 'PER_KG' : 'FIXED';
    const resolvedPricePerKg = resolvedPricingType === 'PER_KG' ? (Number(price_per_kg) || Number(price) || 0) : 0;

    const result = await query(
      `INSERT INTO price_items (item_id, name, category, subcategory, unit, price, ironing_price, express_price, pricing_type, price_per_kg)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [item_id, name, category, subcategory || null, unit, price, ironing_price, express_price ?? null, resolvedPricingType, resolvedPricePerKg]
    );
    
    res.status(201).json({
      message: 'Price item created successfully',
      price: result.rows[0],
    });
  } catch (error: any) {
    if (error.message?.includes('duplicate key')) {
      return res.status(409).json({ error: 'Item ID already exists' });
    }
    console.error('Create price error:', error);
    res.status(500).json({ error: 'Failed to create price' });
  }
};

export const updatePrice = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { id } = req.params;
    const { 
      name, 
      category, 
      subcategory, 
      unit,
      price, 
      ironing_price,
      express_price,
      is_active,
      discount_percentage,
      discount_start_date,
      discount_end_date 
    } = req.body;
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (name) {
      const cleanName = String(name).trim().replace(/\s+/g, ' ');
      const duplicate = await query(
        `SELECT id, name FROM price_items
         WHERE LOWER(TRIM(name)) = LOWER($1) AND id <> $2 LIMIT 1`,
        [cleanName, id]
      );
      if (duplicate.rows.length > 0) {
        return res.status(409).json({
          error: `Another price list item is already named "${duplicate.rows[0].name}".`,
          code: 'DUPLICATE_ITEM_NAME',
        });
      }
      updates.push(`name = $${paramCount++}`);
      values.push(cleanName);
    }
    if (category) {
      updates.push(`category = $${paramCount++}`);
      values.push(category);
    }
    if (subcategory !== undefined) {
      updates.push(`subcategory = $${paramCount++}`);
      values.push(subcategory);
    }
    if (unit !== undefined) {
      updates.push(`unit = $${paramCount++}`);
      values.push(unit);
    }
    if (price !== undefined) {
      updates.push(`price = $${paramCount++}`);
      values.push(price);
    }
    if (ironing_price !== undefined) {
      updates.push(`ironing_price = $${paramCount++}`);
      values.push(ironing_price);
    }
    if (express_price !== undefined) {
      // Allow NULL to reset to automatic
      updates.push(`express_price = $${paramCount++}`);
      values.push(express_price);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }
    if (discount_percentage !== undefined) {
      updates.push(`discount_percentage = $${paramCount++}`);
      values.push(discount_percentage);
    }
    if (discount_start_date !== undefined) {
      updates.push(`discount_start_date = $${paramCount++}`);
      // Convert empty string to NULL for timestamp fields
      values.push(discount_start_date === '' ? null : discount_start_date);
    }
    if (discount_end_date !== undefined) {
      updates.push(`discount_end_date = $${paramCount++}`);
      values.push(discount_end_date === '' ? null : discount_end_date);
    }
    if (req.body.pricing_type !== undefined) {
      const pt = req.body.pricing_type === 'PER_KG' ? 'PER_KG' : 'FIXED';
      updates.push(`pricing_type = $${paramCount++}`);
      values.push(pt);
    }
    if (req.body.price_per_kg !== undefined) {
      updates.push(`price_per_kg = $${paramCount++}`);
      values.push(Number(req.body.price_per_kg) || 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    
    const result = await query(
      `UPDATE price_items SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Price item not found' });
    }
    
    res.json({
      message: 'Price item updated successfully',
      price: result.rows[0],
    });
  } catch (error) {
    console.error('Update price error:', error);
    res.status(500).json({ error: 'Failed to update price' });
  }
};

export const deletePrice = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // BUSINESS RULE: Check if used in ANY orders (especially unpaid/partial/pending)
    const ordersCheck = await query(`
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COUNT(DISTINCT CASE WHEN o.payment_status IN ('UNPAID', 'PARTIAL') THEN o.id END) as unpaid_orders,
        COUNT(DISTINCT CASE WHEN LOWER(COALESCE(o.status::text, o.order_status::text, '')) NOT IN ('delivered', 'cancelled') THEN o.id END) as pending_orders
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.price_item_id = $1
    `, [id]);
    
    const totalOrders = parseInt(ordersCheck.rows[0].total_orders);
    const unpaidOrders = parseInt(ordersCheck.rows[0].unpaid_orders);
    const pendingOrders = parseInt(ordersCheck.rows[0].pending_orders);
    
    // STRICT BUSINESS RULE: Cannot delete if used in ANY orders
    if (totalOrders > 0) {
      const reasons = [];
      if (unpaidOrders > 0) {
        reasons.push(`${unpaidOrders} unpaid/partial order${unpaidOrders > 1 ? 's' : ''}`);
      }
      if (pendingOrders > 0) {
        reasons.push(`${pendingOrders} pending order${pendingOrders > 1 ? 's' : ''}`);
      }
      if (reasons.length === 0) {
        reasons.push(`${totalOrders} historical order${totalOrders > 1 ? 's' : ''}`);
      }
      
      // Deactivate instead of delete (preserve data integrity)
      await query(
        'UPDATE price_items SET is_active = false WHERE id = $1',
        [id]
      );
      
      // 409 (not 200) so the UI never reports this as a successful delete.
      return res.status(409).json({
        error: `This item is used in ${reasons.join(' and ')}, so it cannot be deleted. It has been hidden from new orders instead, and past records stay intact.`,
        deactivated: true,
        unpaidOrders,
        pendingOrders,
        totalOrders,
        businessRule: 'DELETION_PROTECTION'
      });
    }
    
    // No orders at all - safe to delete permanently
    const result = await query(
      'DELETE FROM price_items WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Price item not found' });
    }
    
    res.json({ message: 'Price item deleted successfully', deleted: true });
  } catch (error: any) {
    // Another table still references this item (race, or a link we do not pre-check)
    if (error?.code === '23503') {
      await query('UPDATE price_items SET is_active = false WHERE id = $1', [req.params.id]).catch(() => undefined);
      return res.status(409).json({
        error: 'This item is still linked to existing records, so it cannot be deleted. It has been hidden from new orders instead.',
        deactivated: true,
      });
    }
    console.error('Delete price error:', error);
    res.status(500).json({ error: 'Failed to delete price' });
  }
};

/** GET /api/prices/categories — list all categories with item counts */
export const getCategories = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT category AS name, COUNT(*) FILTER (WHERE is_active = true) AS item_count
      FROM price_items
      GROUP BY category
      ORDER BY category ASC
    `);
    res.json({ categories: result.rows.map(r => ({ name: r.name, item_count: Number(r.item_count) })) });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

/** PUT /api/prices/categories/:name — rename a category (updates all items) */
export const renameCategory = async (req: AuthRequest, res: Response) => {
  try {
    const oldName = decodeURIComponent(req.params.name);
    const { new_name } = req.body as { new_name?: string };
    if (!new_name?.trim()) return res.status(400).json({ error: 'new_name is required' });
    const clean = new_name.trim().toLowerCase().replace(/\s+/g, '_');
    // Check uniqueness (case-insensitive, excluding self)
    const conflict = await query(
      `SELECT 1 FROM price_items WHERE LOWER(category) = LOWER($1) AND LOWER(category) <> LOWER($2) LIMIT 1`,
      [clean, oldName]
    );
    if (conflict.rows.length) return res.status(409).json({ error: `Category "${clean}" already exists.` });
    const result = await query(
      `UPDATE price_items SET category = $1 WHERE LOWER(category) = LOWER($2)`,
      [clean, oldName]
    );
    res.json({ updated: result.rowCount, old_name: oldName, new_name: clean });
  } catch (error) {
    console.error('Rename category error:', error);
    res.status(500).json({ error: 'Failed to rename category' });
  }
};

/** DELETE /api/prices/categories/:name — only if item count = 0 */
export const deleteCategory = async (req: AuthRequest, res: Response) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const count = await query(
      `SELECT COUNT(*) FROM price_items WHERE LOWER(category) = LOWER($1)`,
      [name]
    );
    if (Number(count.rows[0].count) > 0) {
      return res.status(409).json({ error: 'Cannot delete a category that still has items. Remove all items first or rename it.' });
    }
    res.json({ deleted: true, name });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
};

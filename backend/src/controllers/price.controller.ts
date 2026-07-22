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

export const createPrice = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { item_id, name, category, subcategory, unit = 'piece', price, ironing_price, express_price } = req.body;
    
    const result = await query(
      `INSERT INTO price_items (item_id, name, category, subcategory, unit, price, ironing_price, express_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [item_id, name, category, subcategory, unit, price, ironing_price, express_price]
    );
    
    res.status(201).json({
      message: 'Price item created successfully',
      price: result.rows[0],
    });
  } catch (error: any) {
    if (error.message.includes('duplicate key')) {
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
      updates.push(`name = $${paramCount++}`);
      values.push(name);
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
      // Convert empty string to NULL for timestamp fields
      values.push(discount_end_date === '' ? null : discount_end_date);
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
        COUNT(DISTINCT CASE WHEN o.order_status NOT IN ('delivered', 'cancelled') THEN o.id END) as pending_orders
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
      
      return res.json({ 
        message: `❌ Cannot delete: Used in ${reasons.join(' and ')}. Item DEACTIVATED instead to preserve business records.`,
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
    
    res.json({ message: 'Price item deleted successfully' });
  } catch (error) {
    console.error('Delete price error:', error);
    res.status(500).json({ error: 'Failed to delete price' });
  }
};

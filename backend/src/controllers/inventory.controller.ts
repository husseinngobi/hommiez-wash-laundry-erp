import { Response } from 'express';
import { validationResult } from 'express-validator';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

/**
 * Get all inventory items
 */
export const getAllInventoryItems = async (req: AuthRequest, res: Response) => {
  try {
    const { low_stock, category } = req.query;
    
    let sql = `
      SELECT 
        id,
        item_name as name,
        category,
        quantity as quantity_in_stock,
        unit,
        unit_cost,
        reorder_level,
        supplier,
        last_restocked as last_restock_date,
        max_stock_quantity,
        expected_duration_value,
        expected_duration_unit,
        is_long_term,
        low_stock_threshold_percent,
        asset_value,
        asset_purchase_date,
        asset_serial_number,
        asset_condition,
        asset_location,
        notes,
        created_at,
        updated_at
      FROM inventory_items 
      WHERE 1=1
        AND COALESCE(is_active, TRUE) = TRUE
    `;
    const values: any[] = [];
    let paramCount = 1;
    
    if (category) {
      sql += ` AND category = $${paramCount++}`;
      values.push(category);
    }
    
    if (low_stock === 'true') {
      sql += ` AND quantity <= reorder_level`;
    }
    
    sql += ' ORDER BY item_name ASC';
    
    const result = await query(sql, values);
    
    res.json({
      items: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get inventory items error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
};

/**
 * Add stock (restock)
 */
export const addStock = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { item_id, quantity, unit_cost, notes } = req.body;
    const userId = req.user?.id;
    
    // Get current stock
    const itemResult = await query(
      'SELECT * FROM inventory_items WHERE id = $1',
      [item_id]
    );
    
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const item = itemResult.rows[0];
    const newQuantity = parseFloat(item.quantity) + parseFloat(quantity);
    const totalCost = parseFloat(quantity) * parseFloat(unit_cost || item.unit_cost);
    
    // Update stock quantity
    await query(
      `UPDATE inventory_items 
       SET quantity = $1, last_restocked = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [newQuantity, item_id]
    );
    
    // Record transaction
    await query(
      `INSERT INTO inventory_transactions 
       (inventory_item_id, transaction_type, quantity, unit_cost, total_cost, notes, created_by)
       VALUES ($1, 'RESTOCK', $2, $3, $4, $5, $6)`,
      [item_id, quantity, unit_cost || item.unit_cost, totalCost, notes, userId]
    );
    
    res.json({
      message: 'Stock added successfully',
      new_quantity: newQuantity,
    });
  } catch (error) {
    console.error('Add stock error:', error);
    res.status(500).json({ error: 'Failed to add stock' });
  }
};

/**
 * Record stock usage
 */
export const recordUsage = async (req: AuthRequest, res: Response) => {
  try {
    const { item_id, quantity, order_id, notes } = req.body;
    const userId = req.user?.id;
    
    // Get current stock
    const itemResult = await query(
      'SELECT * FROM inventory_items WHERE id = $1',
      [item_id]
    );
    
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const item = itemResult.rows[0];
    const newQuantity = parseFloat(item.quantity) - parseFloat(quantity);
    
    if (newQuantity < 0) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }
    
    // Update stock quantity
    await query(
      'UPDATE inventory_items SET quantity = $1, updated_at = NOW() WHERE id = $2',
      [newQuantity, item_id]
    );
    
    // Record transaction
    await query(
      `INSERT INTO inventory_transactions 
       (inventory_item_id, transaction_type, quantity, unit_cost, reference_order_id, notes, created_by)
       VALUES ($1, 'USAGE', $2, $3, $4, $5, $6)`,
      [item_id, quantity, item.unit_cost, order_id, notes, userId]
    );
    
    res.json({
      message: 'Usage recorded successfully',
      new_quantity: newQuantity,
    });
  } catch (error) {
    console.error('Record usage error:', error);
    res.status(500).json({ error: 'Failed to record usage' });
  }
};

/**
 * Get inventory transactions history
 */
export const getTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const { item_id, type, limit = 50 } = req.query;
    
    let sql = `
      SELECT t.*, i.item_name, i.unit, u.full_name as created_by_name
      FROM inventory_transactions t
      JOIN inventory_items i ON t.inventory_item_id = i.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE 1=1
    `;
    const values: any[] = [];
    let paramCount = 1;
    
    if (item_id) {
      sql += ` AND t.inventory_item_id = $${paramCount++}`;
      values.push(item_id);
    }
    
    if (type) {
      sql += ` AND t.transaction_type = $${paramCount++}`;
      values.push(type);
    }
    
    sql += ` ORDER BY t.created_at DESC LIMIT $${paramCount}`;
    values.push(limit);
    
    const result = await query(sql, values);
    
    res.json({
      transactions: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

/**
 * Create new inventory item
 */
export const createInventoryItem = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const {
      item_name,
      unit,
      quantity = 0,
      reorder_level = 0,
      unit_cost = 0,
      category,
      supplier,
      notes,
      max_stock_quantity,
      expected_duration_value,
      expected_duration_unit,
      is_long_term = false,
      low_stock_threshold_percent = 20,
      asset_value,
      asset_purchase_date,
      asset_serial_number,
      asset_condition,
      asset_location,
    } = req.body;

    const longTerm = Boolean(is_long_term);
    const resolvedUnit = longTerm ? (unit || 'ASSET') : unit;
    const resolvedCost = longTerm
      ? Number(asset_value ?? unit_cost) || 0
      : Number(unit_cost) || 0;
    
    const result = await query(
      `INSERT INTO inventory_items 
       (item_name, unit, quantity, reorder_level, unit_cost, category, supplier, notes, 
        max_stock_quantity, expected_duration_value, expected_duration_unit, is_long_term, 
        low_stock_threshold_percent, asset_value, asset_purchase_date, asset_serial_number,
        asset_condition, asset_location, last_restocked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
       RETURNING *`,
      [
        item_name,
        resolvedUnit,
        longTerm ? Math.max(1, Number(quantity) || 1) : quantity,
        longTerm ? 0 : reorder_level,
        resolvedCost,
        category,
        supplier,
        notes,
        longTerm ? null : max_stock_quantity,
        longTerm ? null : expected_duration_value,
        longTerm ? null : expected_duration_unit,
        longTerm,
        longTerm ? 20 : low_stock_threshold_percent,
        longTerm ? (asset_value != null ? Number(asset_value) : resolvedCost) : null,
        longTerm && asset_purchase_date ? asset_purchase_date : null,
        longTerm ? (asset_serial_number || null) : null,
        longTerm ? (asset_condition || 'GOOD') : null,
        longTerm ? (asset_location || null) : null,
      ]
    );
    
    res.status(201).json({
      message: 'Inventory item created successfully',
      item: result.rows[0],
    });
  } catch (error) {
    console.error('Create inventory item error:', error);
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
};

/**
 * Update inventory item
 */
export const updateInventoryItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      item_name,
      unit,
      reorder_level,
      unit_cost,
      category,
      supplier,
      notes,
      expected_duration_value,
      expected_duration_unit,
      is_long_term,
      low_stock_threshold_percent,
      max_stock_quantity,
      asset_value,
      asset_purchase_date,
      asset_serial_number,
      asset_condition,
      asset_location,
      quantity_in_stock,
    } = req.body;

    const longTerm = Boolean(is_long_term);
    const resolvedUnit = longTerm ? (unit || 'ASSET') : unit;
    const resolvedCost = longTerm
      ? Number(asset_value ?? unit_cost) || 0
      : Number(unit_cost) || 0;
    
    const result = await query(
      `UPDATE inventory_items 
       SET item_name = $1,
           unit = $2,
           reorder_level = $3, 
           unit_cost = $4,
           category = $5,
           supplier = $6,
           notes = $7,
           expected_duration_value = $8,
           expected_duration_unit = $9,
           is_long_term = $10,
           low_stock_threshold_percent = $11,
           max_stock_quantity = $12,
           asset_value = $13,
           asset_purchase_date = $14,
           asset_serial_number = $15,
           asset_condition = $16,
           asset_location = $17,
           quantity = COALESCE($18, quantity),
           updated_at = NOW()
       WHERE id = $19
       RETURNING *`,
      [
        item_name,
        resolvedUnit,
        longTerm ? 0 : reorder_level,
        resolvedCost,
        category,
        supplier,
        notes,
        longTerm ? null : expected_duration_value,
        longTerm ? null : expected_duration_unit,
        longTerm,
        longTerm ? 20 : (low_stock_threshold_percent ?? 20),
        longTerm ? null : max_stock_quantity,
        longTerm ? (asset_value != null ? Number(asset_value) : resolvedCost) : null,
        longTerm && asset_purchase_date ? asset_purchase_date : null,
        longTerm ? (asset_serial_number || null) : null,
        longTerm ? (asset_condition || 'GOOD') : null,
        longTerm ? (asset_location || null) : null,
        quantity_in_stock != null ? Number(quantity_in_stock) : null,
        id,
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({
      message: 'Inventory item updated successfully',
      item: result.rows[0],
    });
  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
};

/**
 * Delete inventory item (soft delete)
 */
export const deleteInventoryItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Soft delete the item
    const result = await query(
      'UPDATE inventory_items SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({
      message: 'Inventory item deleted successfully',
    });
  } catch (error) {
    console.error('Delete inventory item error:', error);
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
};

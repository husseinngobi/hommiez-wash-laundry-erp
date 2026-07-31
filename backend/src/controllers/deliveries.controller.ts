import { Response } from 'express';
import { validationResult } from 'express-validator';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

/**
 * Get delivery info for a specific order
 */
export const getDeliveryByOrderId = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;

    const result = await query(
      `SELECT 
        d.*,
        dz.zone_name,
        dz.zone_code,
        dd.name as driver_name,
        dd.phone as driver_phone,
        dd.vehicle_type,
        dd.vehicle_number
      FROM deliveries d
      LEFT JOIN delivery_zones dz ON d.delivery_zone_id = dz.id
      LEFT JOIN delivery_drivers dd ON d.driver_id = dd.id
      WHERE d.order_id = $1
      ORDER BY d.created_at DESC
      LIMIT 1`,
      [orderId]
    );

    if (result.rows.length === 0) {
      return res.json({ delivery: null });
    }

    res.json({ delivery: result.rows[0] });
  } catch (error) {
    console.error('Get delivery by order error:', error);
    res.status(500).json({ error: 'Failed to fetch delivery information' });
  }
};

/**
 * Get all deliveries with full details
 */
export const getAllDeliveries = async (req: AuthRequest, res: Response) => {
  try {
    const { status, date, from_date, to_date, type, driver_id } = req.query;
    
    let sql = `
      SELECT 
        d.*,
        o.order_number,
        o.status as order_status,
        c.name as customer_name,
        c.phone as customer_phone,
        dz.zone_name,
        dz.zone_code,
        dz.base_delivery_cost as zone_cost,
        dd.name as driver_name,
        dd.phone as driver_phone,
        dd.vehicle_type,
        dd.vehicle_number,
        d.delivery_person_name,
        d.vehicle_info
      FROM deliveries d
      JOIN orders o ON d.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN delivery_zones dz ON d.delivery_zone_id = dz.id
      LEFT JOIN delivery_drivers dd ON d.driver_id = dd.id
      WHERE 1=1
    `;
    const values: any[] = [];
    let paramCount = 1;
    
    if (status) {
      sql += ` AND d.delivery_status = $${paramCount++}`;
      values.push(status);
    }
    
    // Support both single date and date range filtering
    if (date) {
      sql += ` AND d.scheduled_date = $${paramCount++}`;
      values.push(date);
    } else if (from_date && to_date) {
      sql += ` AND d.scheduled_date BETWEEN $${paramCount++} AND $${paramCount++}`;
      values.push(from_date, to_date);
    } else if (from_date) {
      sql += ` AND d.scheduled_date >= $${paramCount++}`;
      values.push(from_date);
    } else if (to_date) {
      sql += ` AND d.scheduled_date <= $${paramCount++}`;
      values.push(to_date);
    }
    
    if (type) {
      sql += ` AND d.delivery_type = $${paramCount++}`;
      values.push(type);
    }
    
    if (driver_id) {
      sql += ` AND d.driver_id = $${paramCount++}`;
      values.push(driver_id);
    }
    
    sql += ' ORDER BY d.scheduled_date DESC, d.created_at DESC';
    
    const result = await query(sql, values);
    
    res.json({
      deliveries: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get deliveries error:', error);
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
};

/**
 * Create/Initiate new delivery from order
 */
export const createDelivery = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const {
      order_id,
      delivery_type,
      delivery_revenue,
      scheduled_date,
      scheduled_time_slot,
      delivery_zone_id,
      delivery_address,
      delivery_notes,
      delivery_person_name,
      vehicle_info,
    } = req.body;
    
    const userId = req.user?.id;
    
    // Validate PAID delivery has revenue
    if (delivery_type === 'PAID' && (!delivery_revenue || parseFloat(delivery_revenue) <= 0)) {
      return res.status(400).json({ 
        error: 'Delivery revenue is required for PAID deliveries',
        delivery_type: delivery_type 
      });
    }
    
    // Verify order exists and is ready for delivery
    const orderCheck = await query(
      'SELECT id, status FROM orders WHERE id = $1',
      [order_id]
    );
    
    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const orderStatus = orderCheck.rows[0].status;
    // Accept 'ready' status (new standardized status)
    if (!['ready', 'READY_FOR_PICKUP', 'READY_FOR_DELIVERY'].includes(orderStatus)) {
      return res.status(400).json({ 
        error: 'Order is not ready for delivery',
        currentStatus: orderStatus 
      });
    }
    
    // Set revenue: PAID uses input value, FREE = 0
    const finalRevenue = delivery_type === 'PAID' ? parseFloat(delivery_revenue) : 0;
    
    // Get delivery cost from zone (optional reference only)
    let delivery_cost = 0;
    if (delivery_zone_id) {
      const zoneResult = await query(
        'SELECT base_delivery_cost FROM delivery_zones WHERE id = $1 AND is_active = TRUE',
        [delivery_zone_id]
      );
      if (zoneResult.rows.length > 0) {
        delivery_cost = zoneResult.rows[0].base_delivery_cost;
      }
    }
    
    const result = await query(
      `INSERT INTO deliveries (
        order_id, delivery_type, delivery_revenue, scheduled_date, scheduled_time_slot,
        delivery_zone_id, delivery_address, delivery_cost, delivery_notes,
        delivery_person_name, vehicle_info, delivery_status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING', $12)
      RETURNING *`,
      [
        order_id, delivery_type, finalRevenue, scheduled_date, scheduled_time_slot,
        delivery_zone_id, delivery_address, delivery_cost, delivery_notes,
        delivery_person_name, vehicle_info, userId
      ]
    );
    
    console.log(`✅ Delivery created: ${delivery_type} delivery for order #${order_id}, Revenue: UGX ${finalRevenue.toLocaleString()}`);
    
    res.status(201).json({
      message: 'Delivery initiated successfully',
      delivery: result.rows[0],
    });
  } catch (error) {
    console.error('Create delivery error:', error);
    res.status(500).json({ error: 'Failed to create delivery' });
  }
};

/**
 * Assign driver to delivery
 */
export const assignDriver = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { driver_id } = req.body;
    
    // Verify driver is available
    const driverCheck = await query(
      'SELECT id, status, name FROM delivery_drivers WHERE id = $1 AND is_active = TRUE',
      [driver_id]
    );
    
    if (driverCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Driver not found or inactive' });
    }
    
    if (driverCheck.rows[0].status !== 'AVAILABLE') {
      return res.status(400).json({ 
        error: `Driver ${driverCheck.rows[0].name} is currently ${driverCheck.rows[0].status.toLowerCase()}` 
      });
    }
    
    // Update delivery
    const result = await query(
      `UPDATE deliveries 
       SET driver_id = $1, delivery_status = 'ASSIGNED', assigned_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND delivery_status = 'PENDING'
       RETURNING *`,
      [driver_id, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found or already assigned' });
    }
    
    // Update driver status
    await query(
      `UPDATE delivery_drivers SET status = 'ON_DELIVERY', updated_at = NOW() WHERE id = $1`,
      [driver_id]
    );
    
    res.json({
      message: 'Driver assigned successfully',
      delivery: result.rows[0],
    });
  } catch (error) {
    console.error('Assign driver error:', error);
    res.status(500).json({ error: 'Failed to assign driver' });
  }
};

/**
 * Update delivery details (revenue, address, notes, schedule)
 * Only allowed when delivery is PENDING or ASSIGNED
 */
export const updateDeliveryDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      delivery_revenue,
      delivery_type,
      delivery_address,
      delivery_notes,
      scheduled_date,
      scheduled_time_slot,
    } = req.body;

    // Get current delivery
    const current = await query('SELECT * FROM deliveries WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const currentStatus = current.rows[0].delivery_status;

    // Only allow editing if delivery is not yet completed
    if (!['PENDING', 'ASSIGNED'].includes(currentStatus)) {
      return res.status(400).json({
        error: 'Cannot edit delivery details after it has been dispatched',
        currentStatus,
      });
    }

    // Validate PAID delivery has revenue
    const finalType = delivery_type || current.rows[0].delivery_type;
    const finalRevenue = delivery_revenue !== undefined ? delivery_revenue : current.rows[0].delivery_revenue;

    if (finalType === 'PAID' && (!finalRevenue || parseFloat(finalRevenue) <= 0)) {
      return res.status(400).json({
        error: 'Delivery revenue is required for PAID deliveries',
      });
    }

    // Build update query dynamically
    const updates: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramCount = 1;

    if (delivery_revenue !== undefined) {
      updates.push(`delivery_revenue = $${paramCount++}`);
      values.push(finalType === 'PAID' ? parseFloat(delivery_revenue) : 0);
    }

    if (delivery_type !== undefined) {
      updates.push(`delivery_type = $${paramCount++}`);
      values.push(delivery_type);
    }

    if (delivery_address !== undefined) {
      updates.push(`delivery_address = $${paramCount++}`);
      values.push(delivery_address);
    }

    if (delivery_notes !== undefined) {
      updates.push(`delivery_notes = $${paramCount++}`);
      values.push(delivery_notes);
    }

    if (scheduled_date !== undefined) {
      updates.push(`scheduled_date = $${paramCount++}`);
      values.push(scheduled_date);
    }

    if (scheduled_time_slot !== undefined) {
      updates.push(`scheduled_time_slot = $${paramCount++}`);
      values.push(scheduled_time_slot);
    }

    values.push(id);

    const result = await query(
      `UPDATE deliveries SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    console.log(`✅ Delivery #${id} updated: Type=${finalType}, Revenue=UGX ${finalRevenue}`);

    res.json({
      message: 'Delivery details updated successfully',
      delivery: result.rows[0],
    });
  } catch (error) {
    console.error('Update delivery details error:', error);
    res.status(500).json({ error: 'Failed to update delivery details' });
  }
};

/**
 * Update delivery person name and vehicle info (manual entry)
 */
export const updateDeliveryPerson = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { delivery_person_name, vehicle_info } = req.body;
    
    const result = await query(
      `UPDATE deliveries 
       SET delivery_person_name = $1, vehicle_info = $2, 
           delivery_status = CASE WHEN delivery_status = 'PENDING' THEN 'ASSIGNED' ELSE delivery_status END,
           assigned_at = CASE WHEN assigned_at IS NULL THEN NOW() ELSE assigned_at END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [delivery_person_name, vehicle_info, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    
    res.json({
      message: 'Delivery person updated successfully',
      delivery: result.rows[0],
    });
  } catch (error) {
    console.error('Update delivery person error:', error);
    res.status(500).json({ error: 'Failed to update delivery person' });
  }
};

/**
 * Update delivery status with workflow validation
 */
export const updateDeliveryStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, failed_reason, customer_rating, customer_feedback } = req.body;
    
    // Get current delivery
    const current = await query('SELECT * FROM deliveries WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    
    const currentStatus = current.rows[0].delivery_status;
    const driverId = current.rows[0].driver_id;

    // Cancelling is an administrator action, same rule as cancelling an order
    if (String(status).toUpperCase() === 'CANCELLED' && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can cancel a delivery' });
    }
    
    // Validate status transition workflow.
    // ASSIGNED and IN_TRANSIT must be listed: assigning a rider moves a delivery
    // into ASSIGNED, and without an entry here it could never be completed.
    const validTransitions: Record<string, string[]> = {
      'PENDING': ['ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'],
      'ASSIGNED': ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'],
      'IN_TRANSIT': ['ASSIGNED', 'DELIVERED', 'FAILED', 'CANCELLED'],
      'DELIVERED': ['PENDING', 'CANCELLED'], // Can revert or cancel if needed
      'FAILED': ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'CANCELLED'],
      'CANCELLED': ['PENDING'], // Can restart a cancelled delivery
    };
    
    if (currentStatus !== status && !validTransitions[currentStatus]?.includes(status)) {
      return res.status(400).json({ 
        error: `Cannot transition from ${currentStatus} to ${status}`,
        currentStatus,
        allowedTransitions: validTransitions[currentStatus] || []
      });
    }
    
    const updates: string[] = ['delivery_status = $1', 'updated_at = NOW()'];
    const values: any[] = [status];
    let paramCount = 2;
    
    // Add timestamps based on status
    if (status === 'DELIVERED') {
      updates.push('delivered_at = NOW()');
      
      // Add customer feedback if provided
      if (customer_rating) {
        updates.push(`customer_rating = $${paramCount++}`);
        values.push(customer_rating);
      }
      if (customer_feedback) {
        updates.push(`customer_feedback = $${paramCount++}`);
        values.push(customer_feedback);
      }
    }
    
    values.push(id);
    
    const result = await query(
      `UPDATE deliveries SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    // Update driver status when delivery is completed or failed
    if (driverId && ['DELIVERED', 'CANCELLED'].includes(status)) {
      await query(
        `UPDATE delivery_drivers SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1`,
        [driverId]
      );
    }

    const orderId = current.rows[0].order_id;
    const deliveryRevenue = parseFloat(current.rows[0].delivery_revenue || 0);

    // IMPORTANT: When delivery is DELIVERED, automatically update the order status to 'delivered'
    if (status === 'DELIVERED') {
      await query(
        `UPDATE orders SET status = 'delivered', pickup_date = CURRENT_TIMESTAMP, updated_at = NOW() WHERE id = $1`,
        [orderId]
      );
      console.log(`✅ Order #${orderId} automatically marked as 'delivered' (delivery completed)`);
    }

    // IMPORTANT: When delivery is CANCELLED, revert order to READY and refund delivery revenue
    if (status === 'CANCELLED') {
      // Revert order status back to READY (not delivered)
      await query(
        `UPDATE orders SET status = 'ready', pickup_date = NULL, updated_at = NOW() WHERE id = $1`,
        [orderId]
      );
      console.log(`🔄 Order #${orderId} reverted to 'ready' (delivery cancelled)`);
      
      // A cancelled delivery earns nothing, so clear its revenue rather than
      // leaving it to inflate the delivery stats
      if (deliveryRevenue > 0) {
        await query(
          `UPDATE deliveries SET delivery_revenue = 0, updated_at = NOW() WHERE id = $1`,
          [id]
        );
        console.log(`💰 Delivery revenue reversed: USh ${deliveryRevenue.toLocaleString()}`);
      }
    }
    
    res.json({
      message: `Delivery status updated to ${status}`,
      delivery: result.rows[0],
    });
  } catch (error) {
    console.error('Update delivery status error:', error);
    res.status(500).json({ error: 'Failed to update delivery status' });
  }
};

/**
 * Get delivery statistics
 */
export const getDeliveryStats = async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query;
    
    let dateFilter = '';
    const values: any[] = [];
    
    if (date) {
      dateFilter = 'WHERE scheduled_date = $1';
      values.push(date);
    } else {
      dateFilter = 'WHERE scheduled_date = CURRENT_DATE';
    }
    
    const result = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE delivery_status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE delivery_status = 'DELIVERED') as delivered,
        COUNT(*) FILTER (WHERE delivery_status = 'CANCELLED') as cancelled,
        COUNT(*) FILTER (WHERE delivery_type = 'PAID') as paid_deliveries,
        COUNT(*) FILTER (WHERE delivery_type = 'FREE') as free_deliveries,
        COALESCE(SUM(delivery_revenue) FILTER (WHERE delivery_type = 'PAID' AND delivery_status <> 'CANCELLED'), 0) as total_delivery_revenue,
        COALESCE(SUM(delivery_revenue) FILTER (WHERE delivery_status = 'DELIVERED' AND delivery_type = 'PAID'), 0) as completed_delivery_revenue
       FROM deliveries
       ${dateFilter}`,
      values
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get delivery stats error:', error);
    res.status(500).json({ error: 'Failed to fetch delivery statistics' });
  }
};

/**
 * Get all delivery zones
 */
export const getDeliveryZones = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT * FROM delivery_zones 
       WHERE is_active = TRUE 
       ORDER BY base_delivery_cost ASC, zone_name ASC`
    );
    
    res.json({
      zones: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get delivery zones error:', error);
    res.status(500).json({ error: 'Failed to fetch delivery zones' });
  }
};

/**
 * Get all delivery drivers
 */
export const getDeliveryDrivers = async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;
    
    let sql = 'SELECT * FROM delivery_drivers WHERE is_active = TRUE';
    const values: any[] = [];
    
    if (status) {
      sql += ' AND status = $1';
      values.push(status);
    }
    
    sql += ' ORDER BY total_deliveries DESC, name ASC';
    
    const result = await query(sql, values);
    
    res.json({
      drivers: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get delivery drivers error:', error);
    res.status(500).json({ error: 'Failed to fetch delivery drivers' });
  }
};

/**
 * Get available drivers for assignment
 */
export const getAvailableDrivers = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT * FROM delivery_drivers 
       WHERE is_active = TRUE AND status = 'AVAILABLE'
       ORDER BY rating DESC, total_deliveries DESC`
    );
    
    res.json({
      drivers: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get available drivers error:', error);
    res.status(500).json({ error: 'Failed to fetch available drivers' });
  }
};

/**
 * Record payment for delivery
 */
export const recordDeliveryPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { payment_amount, payment_method, payment_status, payment_notes } = req.body;
    
    // Validate payment amount
    if (payment_amount !== undefined && payment_amount < 0) {
      return res.status(400).json({ error: 'Payment amount cannot be negative' });
    }
    
    // Validate payment method
    const validMethods = ['CASH', 'MOBILE_MONEY', 'CARD', 'BANK_TRANSFER'];
    if (payment_method && !validMethods.includes(payment_method)) {
      return res.status(400).json({ 
        error: 'Invalid payment method',
        validMethods 
      });
    }
    
    // Validate payment status
    const validStatuses = ['PENDING', 'PAID', 'PARTIAL', 'REFUNDED'];
    if (payment_status && !validStatuses.includes(payment_status)) {
      return res.status(400).json({ 
        error: 'Invalid payment status',
        validStatuses 
      });
    }
    
    // Get current delivery
    const current = await query('SELECT * FROM deliveries WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    
    const updates: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramCount = 1;
    
    if (payment_amount !== undefined) {
      updates.push(`payment_amount = $${paramCount++}`);
      values.push(payment_amount);
    }
    
    if (payment_method) {
      updates.push(`payment_method = $${paramCount++}`);
      values.push(payment_method);
    }
    
    if (payment_status) {
      updates.push(`payment_status = $${paramCount++}`);
      values.push(payment_status);
      
      // Set payment date when marked as PAID
      if (payment_status === 'PAID' && !current.rows[0].payment_date) {
        updates.push('payment_date = NOW()');
      }
    }
    
    if (payment_notes !== undefined) {
      updates.push(`payment_notes = $${paramCount++}`);
      values.push(payment_notes);
    }
    
    values.push(id);
    
    const result = await query(
      `UPDATE deliveries SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    
    res.json({
      message: 'Payment recorded successfully',
      delivery: result.rows[0],
    });
  } catch (error) {
    console.error('Record delivery payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
};

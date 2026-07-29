import { Response } from 'express';
import { validationResult } from 'express-validator';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { logCreate, logUpdate, logDelete } from '../utils/activityLogger';
import { normalizePhone, normalizeCustomerName, formatCustomerPhone } from '../utils/roleLimits';

async function findCustomerByPhone(phone: string, excludeId?: number) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  const values: Array<string | number> = [normalizedPhone];
  let sql = `
    SELECT id, name, customer_id, phone
    FROM customers
    WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $1
  `;

  if (excludeId !== undefined) {
    sql += ' AND id != $2';
    values.push(excludeId);
  }

  const result = await query(sql, values);
  return result.rows[0] ?? null;
}

async function findCustomerByName(name: string, excludeId?: number) {
  const normalizedName = normalizeCustomerName(name);
  if (!normalizedName) return null;

  const values: Array<string | number> = [normalizedName];
  let sql = `
    SELECT id, name, customer_id, phone
    FROM customers
    WHERE LOWER(TRIM(regexp_replace(name, '\\s+', ' ', 'g'))) = $1
  `;

  if (excludeId !== undefined) {
    sql += ' AND id != $2';
    values.push(excludeId);
  }

  const result = await query(sql, values);
  return result.rows[0] ?? null;
}

export const getAllCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const { 
      search, 
      page = '1', 
      limit = '20', 
      type, 
      smsOptIn 
    } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    
    let sql = `
      SELECT c.*, 
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(COALESCE(o.total_amount, o.total, 0)), 0) as total_spent,
        MAX(o.created_at) as last_order_date
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
    `;
    
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (search) {
      conditions.push(`(c.name ILIKE $${paramCount} OR c.phone ILIKE $${paramCount} OR c.email ILIKE $${paramCount} OR c.customer_id ILIKE $${paramCount})`);
      values.push(`%${search}%`);
      paramCount++;
    }
    
    if (type) {
      conditions.push(`c.customer_type = $${paramCount}`);
      values.push(type);
      paramCount++;
    }
    
    if (smsOptIn !== undefined) {
      conditions.push(`c.sms_opt_in = $${paramCount}`);
      values.push(smsOptIn === 'true');
      paramCount++;
    }
    
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    sql += ` GROUP BY c.id ORDER BY c.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limitNum, offset);
    
    // Get total count
    let countSql = 'SELECT COUNT(*) FROM customers c';
    const countValues: any[] = [];
    let countParamCount = 1;
    
    if (conditions.length > 0) {
      const countConditions: string[] = [];
      
      if (search) {
        countConditions.push(`(c.name ILIKE $${countParamCount} OR c.phone ILIKE $${countParamCount} OR c.email ILIKE $${countParamCount} OR c.customer_id ILIKE $${countParamCount})`);
        countValues.push(`%${search}%`);
        countParamCount++;
      }
      
      if (type) {
        countConditions.push(`c.customer_type = $${countParamCount}`);
        countValues.push(type);
        countParamCount++;
      }
      
      if (smsOptIn !== undefined) {
        countConditions.push(`c.sms_opt_in = $${countParamCount}`);
        countValues.push(smsOptIn === 'true');
        countParamCount++;
      }
      
      countSql += ` WHERE ${countConditions.join(' AND ')}`;
    }
    
    const [result, countResult] = await Promise.all([
      query(sql, values),
      query(countSql, countValues)
    ]);
    
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({ 
      customers: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages,
        hasMore: pageNum < totalPages
      }
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

export const getCustomerById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const customerResult = await query(
      'SELECT * FROM customers WHERE id = $1',
      [id]
    );
    
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Get customer orders
    const ordersResult = await query(
      `SELECT id, order_number, status, total, created_at, due_date
       FROM orders
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [id]
    );
    
    res.json({
      customer: customerResult.rows[0],
      recent_orders: ordersResult.rows,
    });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
};

export const createCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Customer validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    
    console.log('Creating customer with data:', req.body);
    
    const { 
      name, phone, email, location, notes, 
      sms_opt_in, customer_type 
    } = req.body;

    const phoneResult = formatCustomerPhone(phone);
    if (!phoneResult.ok) {
      return res.status(400).json({ error: 'INVALID_PHONE', message: phoneResult.message });
    }
    const e164Phone = phoneResult.e164;

    const existingPhone = await findCustomerByPhone(e164Phone);
    if (existingPhone) {
      return res.status(409).json({
        error: 'DUPLICATE_PHONE',
        message: `This number already belongs to customer "${existingPhone.name}" (${existingPhone.customer_id}). Use a different phone number.`,
        existingCustomer: existingPhone
      });
    }

    // Names are free-form (any casing/symbols); uniqueness is by phone only
    
    // Convert empty strings to NULL for optional fields (allows multiple NULL values, but unique non-empty values)
    const normalizedEmail = email?.trim() || null;
    const normalizedLocation = location?.trim() || null;
    const normalizedNotes = notes?.trim() || null;
    const freeName = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 255);
    
    // Generate customer ID
    const yearResult = await query('SELECT EXTRACT(YEAR FROM CURRENT_DATE) as year');
    const year = yearResult.rows[0].year;
    
    const countResult = await query('SELECT COUNT(*) as count FROM customers');
    const count = parseInt(countResult.rows[0].count) + 1;
    const customer_id = `CUST${year}${String(count).padStart(4, '0')}`;
    
    const result = await query(
      `INSERT INTO customers (
        customer_id, name, phone, email, location, notes,
        sms_opt_in, customer_type
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        customer_id, freeName, e164Phone,
        normalizedEmail,
        normalizedLocation ? normalizedLocation.slice(0, 200) : null,
        normalizedNotes ? normalizedNotes.slice(0, 500) : null,
        sms_opt_in !== false, customer_type || 'INDIVIDUAL'
      ]
    );
    
    // Log customer creation for audit trail
    await logCreate(
      req.user!.id,
      req.user!.email,
      req.user!.full_name,
      req.user!.role,
      'customer',
      result.rows[0].id,
      { 
        customer_id,
        name: freeName,
        phone: e164Phone,
        customer_type: customer_type || 'INDIVIDUAL'
      },
      req.ip
    );
    
    res.status(201).json({
      message: 'Customer created successfully',
      customer: result.rows[0],
    });
  } catch (error: any) {
    console.error('Create customer error:', error);
    
    // Handle UNIQUE constraint violations professionally
    if (error.code === '23505') { // PostgreSQL unique_violation error code
      // Check which constraint was violated
      if (error.constraint === 'unique_customer_phone') {
        // Get existing customer details to show helpful message
        const { phone } = req.body;
        try {
          const existing = await query(
            'SELECT id, customer_id, name, phone FROM customers WHERE phone = $1',
            [phone]
          );
          if (existing.rows.length > 0) {
            const customer = existing.rows[0];
            return res.status(409).json({ 
              error: 'DUPLICATE_PHONE',
              message: `This number already belongs to customer "${customer.name}" (${customer.customer_id}). Use a different phone number.`,
              existingCustomer: {
                id: customer.id,
                customer_id: customer.customer_id,
                name: customer.name,
                phone: customer.phone
              }
            });
          }
        } catch (fetchError) {
          console.error('Error fetching existing customer:', fetchError);
        }
        return res.status(409).json({ 
          error: 'DUPLICATE_PHONE',
          message: 'A customer with this phone number already exists' 
        });
      }
      
      if (error.constraint === 'unique_customer_email') {
        // Get existing customer details to show helpful message
        const { email } = req.body;
        try {
          const existing = await query(
            'SELECT id, customer_id, name, email FROM customers WHERE email = $1',
            [email]
          );
          if (existing.rows.length > 0) {
            const customer = existing.rows[0];
            return res.status(409).json({ 
              error: 'DUPLICATE_EMAIL',
              message: `This email already exists for customer "${customer.name}" (ID: ${customer.customer_id})`,
              existingCustomer: {
                id: customer.id,
                customer_id: customer.customer_id,
                name: customer.name,
                email: customer.email
              }
            });
          }
        } catch (fetchError) {
          console.error('Error fetching existing customer:', fetchError);
        }
        return res.status(409).json({ 
          error: 'DUPLICATE_EMAIL',
          message: 'A customer with this email already exists' 
        });
      }
      
      // Generic duplicate error
      return res.status(409).json({ 
        error: 'DUPLICATE_ENTRY',
        message: 'This customer information already exists in the system' 
      });
    }
    
    res.status(500).json({ error: 'Failed to create customer' });
  }
};

export const updateCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { id } = req.params;
    const { 
      name, phone, email, location, notes,
      sms_opt_in, customer_type
    } = req.body;

    const customerId = parseInt(id, 10);

    let e164Phone: string | undefined;
    if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
      const phoneResult = formatCustomerPhone(phone);
      if (!phoneResult.ok) {
        return res.status(400).json({ error: 'INVALID_PHONE', message: phoneResult.message });
      }
      e164Phone = phoneResult.e164;

      const existingPhone = await findCustomerByPhone(e164Phone, customerId);
      if (existingPhone) {
        return res.status(409).json({
          error: 'DUPLICATE_PHONE',
          message: `This number already belongs to customer "${existingPhone.name}" (${existingPhone.customer_id}). Use a different phone number.`,
          existingCustomer: existingPhone
        });
      }
    }

    // Names are free-form — no case/symbol/duplicate-name restrictions
    
    // Convert empty strings to NULL for optional fields
    const normalizedEmail = email !== undefined ? (email?.trim() || null) : undefined;
    const normalizedLocation = location !== undefined ? (location?.trim() || null) : undefined;
    const normalizedNotes = notes !== undefined ? (notes?.trim() || null) : undefined;
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(String(name).trim().replace(/\s+/g, ' ').slice(0, 255));
    }
    if (e164Phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(e164Phone);
    }
    if (normalizedEmail !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(normalizedEmail);
    }
    if (normalizedLocation !== undefined) {
      updates.push(`location = $${paramCount++}`);
      values.push(normalizedLocation ? normalizedLocation.slice(0, 200) : null);
    }
    if (normalizedNotes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(normalizedNotes ? normalizedNotes.slice(0, 500) : null);
    }
    if (sms_opt_in !== undefined) {
      updates.push(`sms_opt_in = $${paramCount++}`);
      values.push(sms_opt_in);
    }
    if (customer_type !== undefined) {
      updates.push(`customer_type = $${paramCount++}`);
      values.push(customer_type);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    
    const result = await query(
      `UPDATE customers SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Log customer update for audit trail
    await logUpdate(
      req.user!.id,
      req.user!.email,
      req.user!.full_name,
      req.user!.role,
      'customer',
      parseInt(id),
      { 
        updated_fields: Object.keys(req.body),
        name: result.rows[0].name,
        phone: result.rows[0].phone
      },
      req.ip
    );
    
    res.json({
      message: 'Customer updated successfully',
      customer: result.rows[0],
    });
  } catch (error: any) {
    console.error('Update customer error:', error);
    
    // Handle UNIQUE constraint violations professionally
    if (error.code === '23505') { // PostgreSQL unique_violation error code
      const { id } = req.params;
      const { phone, email } = req.body;
      
      if (error.constraint === 'unique_customer_phone') {
        try {
          const existing = await query(
            'SELECT id, customer_id, name, phone FROM customers WHERE phone = $1 AND id != $2',
            [phone, id]
          );
          if (existing.rows.length > 0) {
            const customer = existing.rows[0];
            return res.status(409).json({ 
              error: 'DUPLICATE_PHONE',
              message: `This number already belongs to customer "${customer.name}" (${customer.customer_id}). Use a different phone number.`,
              existingCustomer: {
                id: customer.id,
                customer_id: customer.customer_id,
                name: customer.name,
                phone: customer.phone
              }
            });
          }
        } catch (fetchError) {
          console.error('Error fetching existing customer:', fetchError);
        }
        return res.status(409).json({ 
          error: 'DUPLICATE_PHONE',
          message: 'A customer with this phone number already exists' 
        });
      }
      
      if (error.constraint === 'unique_customer_email') {
        try {
          const existing = await query(
            'SELECT id, customer_id, name, email FROM customers WHERE email = $1 AND id != $2',
            [email, id]
          );
          if (existing.rows.length > 0) {
            const customer = existing.rows[0];
            return res.status(409).json({ 
              error: 'DUPLICATE_EMAIL',
              message: `This email already exists for customer "${customer.name}" (ID: ${customer.customer_id})`,
              existingCustomer: {
                id: customer.id,
                customer_id: customer.customer_id,
                name: customer.name,
                email: customer.email
              }
            });
          }
        } catch (fetchError) {
          console.error('Error fetching existing customer:', fetchError);
        }
        return res.status(409).json({ 
          error: 'DUPLICATE_EMAIL',
          message: 'A customer with this email already exists' 
        });
      }
    }
    
    res.status(500).json({ error: 'Failed to update customer' });
  }
};

export const deleteCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check customer's order status
    const ordersCheck = await query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN payment_status != 'PAID' THEN 1 END) as unpaid_orders,
        COUNT(CASE WHEN status NOT IN ('delivered') THEN 1 END) as pending_orders
      FROM orders 
      WHERE customer_id = $1
    `, [id]);
    
    const totalOrders = parseInt(ordersCheck.rows[0].total_orders);
    const unpaidOrders = parseInt(ordersCheck.rows[0].unpaid_orders);
    const pendingOrders = parseInt(ordersCheck.rows[0].pending_orders);
    
    // STRICT BUSINESS RULE: Allow deletion ONLY if:
    // 1. Customer has NO orders at all, OR
    // 2. ALL orders are FULLY PAID (payment_status = 'PAID') AND DELIVERED (order_status = 'delivered')
    if (totalOrders > 0 && (unpaidOrders > 0 || pendingOrders > 0)) {
      const reasons = [];
      if (unpaidOrders > 0) {
        reasons.push(`${unpaidOrders} order${unpaidOrders > 1 ? 's' : ''} not fully paid`);
      }
      if (pendingOrders > 0) {
        reasons.push(`${pendingOrders} order${pendingOrders > 1 ? 's' : ''} not delivered`);
      }
      
      return res.status(400).json({ 
        error: `❌ Cannot delete customer: Has ${reasons.join(' and ')}. Customer can ONLY be deleted when they have NO orders OR all orders are fully paid and delivered.`,
        unpaidOrders,
        pendingOrders,
        totalOrders,
        businessRule: 'DELETION_PROTECTION'
      });
    }
    
    // Delete customer (CASCADE will delete their orders automatically)
    const result = await query(
      'DELETE FROM customers WHERE id = $1 RETURNING id, name',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    const deletedCustomer = result.rows[0];
    
    // Log customer deletion for audit trail
    await logDelete(
      req.user!.id,
      req.user!.email,
      req.user!.full_name,
      req.user!.role,
      'customer',
      parseInt(id),
      { 
        customer_name: deletedCustomer.name,
        total_orders: totalOrders,
        reason: 'All orders paid and delivered'
      },
      req.ip
    );
    
    res.json({ 
      message: `Customer "${result.rows[0].name}" and ${totalOrders} order${totalOrders !== 1 ? 's' : ''} deleted successfully`,
      deletedOrders: totalOrders
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
};

export const getCustomerStats = async (req: AuthRequest, res: Response) => {
  try {
    // Get total customers
    const totalResult = await query('SELECT COUNT(*) as total FROM customers');
    const total = parseInt(totalResult.rows[0].total);
    
    // Get customer type distribution
    const typeResult = await query(`
      SELECT customer_type, COUNT(*) as count 
      FROM customers 
      GROUP BY customer_type
    `);
    
    const individuals = typeResult.rows.find(r => r.customer_type === 'INDIVIDUAL')?.count || 0;
    const businesses = typeResult.rows.find(r => r.customer_type === 'BUSINESS')?.count || 0;
    
    // Get SMS opt-in stats
    const smsResult = await query(`
      SELECT sms_opt_in, COUNT(*) as count 
      FROM customers 
      GROUP BY sms_opt_in
    `);
    
    const smsOptedIn = smsResult.rows.find(r => r.sms_opt_in === true)?.count || 0;
    const smsOptedOut = smsResult.rows.find(r => r.sms_opt_in === false)?.count || 0;
    
    res.json({
      total,
      individuals: parseInt(individuals),
      businesses: parseInt(businesses),
      smsOptedIn: parseInt(smsOptedIn),
      smsOptedOut: parseInt(smsOptedOut),
    });
  } catch (error) {
    console.error('Get customer stats error:', error);
    res.status(500).json({ error: 'Failed to fetch customer statistics' });
  }
};

// Check for duplicate customers before creation (real-time validation)
export const checkDuplicateCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const { phone, email, name, exclude_id } = req.query;
    const excludeId = exclude_id ? parseInt(String(exclude_id), 10) : undefined;
    
    const duplicates: any = {
      phone: null,
      email: null,
      similarNames: []
    };

    let phoneMessage: string | null = null;
    
    // Check phone number (CRITICAL - must be unique)
    if (phone && typeof phone === 'string' && phone.trim() !== '') {
      const phoneResult = formatCustomerPhone(phone);
      if (!phoneResult.ok) {
        phoneMessage = phoneResult.message;
      } else {
        const existingPhone = await findCustomerByPhone(
          phoneResult.e164,
          Number.isFinite(excludeId) ? excludeId : undefined
        );
        if (existingPhone) {
          duplicates.phone = existingPhone;
          phoneMessage = `This number already belongs to "${existingPhone.name}" (${existingPhone.customer_id}). Use a different phone number.`;
        }
      }
    }
    
    // Check email (CRITICAL - must be unique)
    if (email && typeof email === 'string' && email.trim() !== '') {
      const values: Array<string | number> = [email.trim()];
      let emailSql = 'SELECT id, customer_id, name, phone, email FROM customers WHERE email = $1';
      if (Number.isFinite(excludeId)) {
        emailSql += ' AND id != $2';
        values.push(excludeId as number);
      }
      const emailResult = await query(emailSql, values);
      if (emailResult.rows.length > 0) {
        duplicates.email = emailResult.rows[0];
      }
    }
    
    // Names may repeat; only phone/email block creation
    if (name && typeof name === 'string' && name.trim() !== '') {
      const existingName = await findCustomerByName(
        name,
        Number.isFinite(excludeId) ? excludeId : undefined
      );
      if (existingName) {
        duplicates.similarNames = [existingName]; // informational only
      }
    }
    
    const hasDuplicates = duplicates.phone !== null || 
                          duplicates.email !== null || 
                          duplicates.similarNames.length > 0;
    
    const blockingDuplicate = duplicates.phone !== null || duplicates.email !== null;
    
    res.json({
      hasDuplicates,
      blockingDuplicate,
      duplicates,
      phone_message: phoneMessage,
      message: duplicates.phone
        ? `This number already belongs to "${duplicates.phone.name}" (${duplicates.phone.customer_id})`
        : phoneMessage
          ? phoneMessage
          : blockingDuplicate
            ? 'A customer with this email already exists — use a unique email'
            : hasDuplicates
              ? 'Similar name found (names may be shared) — safe to proceed if phone is unique'
              : 'No duplicates found - safe to proceed'
    });
  } catch (error) {
    console.error('Check duplicate customer error:', error);
    res.status(500).json({ error: 'Failed to check for duplicates' });
  }
};

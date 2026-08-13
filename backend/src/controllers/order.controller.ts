import { Response } from 'express';
import { validationResult } from 'express-validator';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { OrderStatus } from '../models/Order';
import { sendOrderDeliveredNotification, sendOrderReadyNotification, sendOrderReceipt } from '../services/sms.service';
import { sendOrderConfirmation } from '../services/whatsapp.service';
import { sendOrderReady } from '../services/whatsapp.service';
import { generateOrderReceiptPDF } from '../services/pdf.service';
import { logCreate, logUpdate, logDelete } from '../utils/activityLogger';
import { getEffectiveBargainLimit, getMaxDiscountForRole } from '../utils/roleLimits';
import fs from 'fs';

type SettingsQuerier = { query: (text: string) => Promise<any> };

function parseSettingJson(raw: any): any {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * VAT is charged only when URA compliance is switched on in Settings.
 * `ura_compliance_enabled` is what the Settings page writes; `vat_enabled` is
 * the older shape and is still honoured so existing installs keep working.
 */
export async function resolveVatConfig(
  db: SettingsQuerier
): Promise<{ enabled: boolean; rate: number }> {
  const result = await db.query(
    `SELECT setting_key, setting_value FROM business_settings
     WHERE setting_key IN ('ura_compliance_enabled', 'vat_enabled', 'vat_rate')`
  );

  const settings: Record<string, any> = {};
  result.rows.forEach((row: any) => {
    settings[row.setting_key] = parseSettingJson(row.setting_value);
  });

  const uraFlag = settings.ura_compliance_enabled;
  const uraEnabled = uraFlag === true || uraFlag === 'true';

  const legacy = settings.vat_enabled;
  const legacyEnabled = legacy?.enabled === true || legacy === true || legacy === 'true';

  const rate =
    parseFloat(String(settings.vat_rate ?? legacy?.rate ?? 18)) || 18;

  return { enabled: uraEnabled || legacyEnabled, rate };
}

export const getAllOrders = async (req: AuthRequest, res: Response) => {
  try {
    const { status, payment_status, customer_id, from_date, to_date, search, page = 1, limit = 15 } = req.query;
    const userRole = req.user?.role;
    
    // Build WHERE clause
    let whereClause = 'WHERE 1=1';
    const values: any[] = [];
    let paramCount = 1;
    
    // BUSINESS RULE: Only ADMIN can see cancelled orders
    if (userRole !== 'ADMIN') {
      whereClause += ` AND o.status != 'cancelled'`;
    }

    // Search by order number, customer name, phone, or staff name
    if (search) {
      whereClause += ` AND (
        o.order_number ILIKE $${paramCount} OR 
        c.name ILIKE $${paramCount} OR 
        c.phone ILIKE $${paramCount} OR
        u.full_name ILIKE $${paramCount}
      )`;
      values.push(`%${search}%`);
      paramCount++;
    }
    
    if (status) {
      whereClause += ` AND o.status = $${paramCount++}`;
      values.push(status);
    }
    
    if (payment_status) {
      whereClause += ` AND o.payment_status = $${paramCount++}`;
      values.push(payment_status);
    }
    
    if (customer_id) {
      whereClause += ` AND o.customer_id = $${paramCount++}`;
      values.push(customer_id);
    }
    
    if (from_date) {
      whereClause += ` AND o.created_at >= $${paramCount++}`;
      values.push(from_date);
    }
    
    if (to_date) {
      whereClause += ` AND o.created_at <= $${paramCount++}`;
      values.push(to_date);
    }
    
    // Get total count
    const countSql = `
      SELECT COUNT(*) 
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.user_id = u.id
      ${whereClause}
    `;
    const countResult = await query(countSql, values);
    const total = parseInt(countResult.rows[0].count);
    
    // Get paginated orders
    const offset = (Number(page) - 1) * Number(limit);
    values.push(Number(limit));
    values.push(offset);
    
    const sql = `
      SELECT o.id, o.order_number, o.customer_id, o.user_id,
        o.status as order_status,
        o.payment_status, o.payment_method, o.subtotal, o.discount,
        o.tax, o.total, o.notes, o.created_at, o.updated_at,
        o.amount_paid, o.total_amount, o.balance, o.due_date, o.pickup_date,
        o.transaction_reference, o.invoice_number,
        o.discount_percentage, o.discount_amount, o.bargain_amount,
        COALESCE(o.surcharge_amount, 0) as surcharge_amount,
        o.tax_rate, o.tax_amount,
        c.name as customer_name,
        c.phone as customer_phone,
        u.full_name as staff_name,
        u.role as user_role,
        u.status as staff_status,
        o.branch_id,
        b.name as branch_name,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.user_id = u.id
      LEFT JOIN branches b ON b.id = o.branch_id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `;
    
    const result = await query(sql, values);
    
    res.json({ 
      orders: result.rows,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

export const getOrderById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get order with customer and staff info
    const orderResult = await query(
      `SELECT o.id, o.order_number, o.customer_id, o.user_id,
        o.status as order_status,
        o.payment_status, o.payment_method, o.subtotal, o.discount,
        o.tax, o.total, o.notes, o.created_at, o.updated_at,
        o.amount_paid, o.total_amount, o.balance, o.due_date, o.pickup_date,
        o.transaction_reference, o.invoice_number,
        o.discount_percentage, o.discount_amount, o.bargain_amount,
        COALESCE(o.surcharge_amount, 0) as surcharge_amount,
        o.tax_rate, o.tax_amount,
        c.name as customer_name, 
        c.phone as customer_phone,
        c.email as customer_email,
        c.location as customer_location,
        u.full_name as staff_name,
        o.branch_id,
        b.name as branch_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN users u ON o.user_id = u.id
      LEFT JOIN branches b ON b.id = o.branch_id
      WHERE o.id = $1`,
      [id]
    );
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    const itemsResult = await query(
      `SELECT oi.*, p.name as item_name, p.category, p.item_id
      FROM order_items oi
      JOIN price_items p ON oi.price_item_id = p.id
      WHERE oi.order_id = $1`,
      [id]
    );
    
    res.json({
      order: orderResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
};

export const createOrder = async (req: AuthRequest, res: Response) => {
  const client = await getClient();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    await client.query('BEGIN');
    
    const { 
      customer_id, 
      items, 
      discount_percentage = 0,
      bargain_amount = 0,
      surcharge_amount = 0,
      payment_status = 'UNPAID',
      payment_method = 'CASH',
      amount_paid = 0,
      transaction_reference,
      pickup_date, 
      notes,
      branch_id: requestedBranchId,
      tax_rate: frontendTaxRate,
      tax_amount: frontendTaxAmount,
      order_date,          // optional back-date (ADMIN / MANAGER only)
    } = req.body;

    // Validate optional back-date: any authenticated staff may record a historical order,
    // but the date must be today or in the past (cannot be future-dated).
    let customOrderDate: string | null = null;
    if (order_date) {
      const parsed = new Date(order_date);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (!isNaN(parsed.getTime()) && parsed <= today) {
        customOrderDate = parsed.toISOString();
      }
    }

    // Branch: staff always book against their own branch; only ADMIN/MANAGER may
    // choose another one, and it must be an active branch.
    const canChooseBranch = req.user!.role === 'ADMIN' || req.user!.role === 'MANAGER';
    let branchId: number | null =
      canChooseBranch && requestedBranchId
        ? Number(requestedBranchId)
        : req.user!.branch_id ?? null;

    if (branchId) {
      const branchCheck = await client.query(
        'SELECT id FROM branches WHERE id = $1 AND is_active = TRUE',
        [branchId]
      );
      if (branchCheck.rows.length === 0) {
        throw new Error('Selected branch is not available');
      }
    } else {
      const defaultBranch = await client.query(
        'SELECT id FROM branches WHERE is_active = TRUE ORDER BY is_default DESC, id ASC LIMIT 1'
      );
      branchId = defaultBranch.rows[0]?.id ?? null;
    }
    
    // ================================================================
    // SECURITY: ALL FINANCIAL CALCULATIONS DONE ON BACKEND
    // NEVER TRUST FRONTEND VALUES FOR MONEY
    // ================================================================
    
    // 1. Calculate subtotal from order items (verify each item price from database)
    let calculatedSubtotal = 0;
    let totalItemDiscount = 0;
    const validatedItems: any[] = [];
    
    for (const item of items) {
      // Fetch actual price from database (prevent price manipulation)
      const priceResult = await client.query(
        `SELECT id, name, unit,
         COALESCE(pricing_type, 'FIXED') as pricing_type,
         COALESCE(price_per_kg, 0) as price_per_kg,
         price, ironing_price, express_price,
         discount_percentage, discount_start_date, discount_end_date,
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
         END as effective_express_price
         FROM price_items 
         WHERE id = $1`,
        [item.price_item_id]
      );
      
      if (priceResult.rows.length === 0) {
        throw new Error(`Invalid price item ID: ${item.price_item_id}`);
      }
      
      const priceItem = priceResult.rows[0];
      const serviceType = item.service_type?.toUpperCase(); // Normalize to uppercase
      const quantity = Number(item.quantity);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Invalid quantity for item ID ${item.price_item_id}`);
      }

      const isPerKg = priceItem.pricing_type === 'PER_KG' || priceItem.unit === 'kg';
      if (!isPerKg && !Number.isInteger(quantity)) {
        throw new Error(`${priceItem.name} must use a whole number quantity`);
      }
      
      let actualUnitPrice = 0;
      if (isPerKg) {
        // PER_KG items: rate per kg. EXPRESS doubles, IRON uses the same kg rate.
        const baseKgRate = Number(priceItem.price_per_kg) > 0 ? Number(priceItem.price_per_kg) : Number(priceItem.effective_price);
        if (serviceType === 'EXPRESS') {
          actualUnitPrice = baseKgRate * 2;
        } else {
          actualUnitPrice = baseKgRate;
        }
      } else if (serviceType === 'WASH') {
        actualUnitPrice = priceItem.effective_price;
      } else if (serviceType === 'IRON') {
        actualUnitPrice = priceItem.effective_ironing_price;
      } else if (serviceType === 'EXPRESS') {
        actualUnitPrice = priceItem.effective_express_price;
      } else {
        throw new Error(`Invalid service type: ${item.service_type}`);
      }
      
      // PER_KG quantities round to nearest 0.1kg; FIXED quantities must be whole
      const normalizedQuantity = isPerKg ? Math.round(quantity * 10) / 10 : quantity;
      const grossItemTotal = Math.round(normalizedQuantity * actualUnitPrice);

      // Per-item bargain: capped at the line total and at the role's discount ceiling,
      // so a line-by-line discount cannot exceed what the staff member may give overall.
      const requestedItemDiscount = Math.round(Number(item.discount_amount) || 0);
      if (requestedItemDiscount < 0) {
        throw new Error(`Item discount cannot be negative for ${priceItem.name}`);
      }

      const roleDiscountCeiling = Math.round(
        grossItemTotal * (getMaxDiscountForRole(req.user!.role) / 100)
      );
      if (requestedItemDiscount > roleDiscountCeiling) {
        throw new Error(
          `Discount on ${priceItem.name} exceeds your limit (max ${getMaxDiscountForRole(req.user!.role)}% = ${roleDiscountCeiling})`
        );
      }

      const itemDiscount = Math.min(requestedItemDiscount, grossItemTotal);

      // Per-item surcharge (price-up): available to all authenticated staff
      const requestedItemSurcharge = Math.round(Number(item.surcharge_amount) || 0);
      if (requestedItemSurcharge < 0) {
        throw new Error(`Item surcharge cannot be negative for ${priceItem.name}`);
      }

      const itemTotal = grossItemTotal + requestedItemSurcharge - itemDiscount;
      calculatedSubtotal += itemTotal;
      totalItemDiscount += itemDiscount;
      
      // Staff-facing garment description (colour, brand, marks). Trimmed and
      // capped to match the column; never shown to the customer.
      const itemNotes =
        typeof item.notes === 'string' && item.notes.trim()
          ? item.notes.trim().slice(0, 200)
          : null;

      validatedItems.push({
        price_item_id: item.price_item_id,
        service_type: item.service_type,
        quantity: normalizedQuantity,
        unit_price: actualUnitPrice, // Use actual DB price, not frontend
        discount_amount: itemDiscount,
        surcharge_amount: requestedItemSurcharge,
        total_price: itemTotal,
        notes: itemNotes
      });
    }
    
    // 2. Validate and calculate discount (role-based limit)
    const discountPercentageValue = parseFloat(discount_percentage.toString()) || 0;
    const maxDiscountForRole = getMaxDiscountForRole(req.user!.role);
    
    if (discountPercentageValue < 0 || discountPercentageValue > maxDiscountForRole) {
      throw new Error(
        `Invalid discount percentage: ${discountPercentageValue}%. Your role allows up to ${maxDiscountForRole}%`
      );
    }
    
    const discount_amount = Math.round(calculatedSubtotal * (discountPercentageValue / 100));
    
    // 2.5. Validate bargain amount (role-based limit)
    const bargainAmountValue = parseInt(bargain_amount.toString()) || 0;
    
    if (bargainAmountValue < 0) {
      throw new Error('Bargain amount cannot be negative');
    }
    
    // Fetch user's maximum bargain limits (overall + per-item)
    const userResult = await client.query(
      `SELECT max_bargain_amount, max_item_bargain_amount, role FROM users WHERE id = $1`,
      [req.user!.id]
    );

    if (userResult.rows.length === 0) throw new Error('User not found');

    const { role, max_bargain_amount, max_item_bargain_amount } = userResult.rows[0];

    // Admins are uncapped; all others obey the configured ceilings.
    const maxOverall  = getEffectiveBargainLimit(role, max_bargain_amount);
    const maxPerItem  = role === 'ADMIN' ? Number.MAX_SAFE_INTEGER
                      : Math.max(0, Number(max_item_bargain_amount) || 0);

    // Enforce per-item ceiling for every line that has a bargain
    if (maxPerItem > 0) {
      for (const item of validatedItems) {
        const itemDiscount = Number(item.discount_amount || 0);
        if (itemDiscount > maxPerItem) {
          throw new Error(
            `Item bargain of UGX ${itemDiscount.toLocaleString()} on one or more items exceeds your per-item limit of UGX ${maxPerItem.toLocaleString()}`
          );
        }
      }
    }

    // Enforce overall ceiling (item bargains + order-level bargain combined)
    const totalBargainRequested = totalItemDiscount + bargainAmountValue;
    if (totalBargainRequested > maxOverall) {
      throw new Error(
        `Total bargain (item discounts + order bargain) of UGX ${totalBargainRequested.toLocaleString()} exceeds your overall limit of UGX ${maxOverall.toLocaleString()}`
      );
    }

    if (bargainAmountValue > maxOverall) {
      throw new Error(
        `Order bargain of UGX ${bargainAmountValue.toLocaleString()} exceeds your overall limit of UGX ${maxOverall.toLocaleString()}`
      );
    }
    
    // Validate bargain amount doesn't exceed order subtotal
    if (bargainAmountValue > calculatedSubtotal) {
      const bargainDisplay = bargainAmountValue.toLocaleString('en-UG');
      const subtotalDisplay = calculatedSubtotal.toLocaleString('en-UG');
      throw new Error(`Bargain amount (UGX ${bargainDisplay}) cannot exceed order subtotal (UGX ${subtotalDisplay})`);
    }
    
    // 2.6. Validate order-level surcharge (price-up) — available to all staff
    const surchargeAmountValue = Math.max(0, parseInt(surcharge_amount.toString()) || 0);

    // 3. Calculate tax.
    // VAT is only ever charged when URA compliance is switched on in Settings.
    // The client's tax values are never trusted — they only signal intent; the
    // rate and amount are always resolved and recomputed here.
    let tax_amount = 0;
    let tax_rate = 0;

    try {
      const vatConfig = await resolveVatConfig(client);

      if (vatConfig.enabled) {
        const clientWantsVat =
          frontendTaxRate === undefined ||
          parseFloat(String(frontendTaxRate)) > 0 ||
          parseInt(String(frontendTaxAmount ?? 0)) > 0;

        if (clientWantsVat) {
          tax_rate = vatConfig.rate;
          // VAT on the amount after discount, bargain, plus any surcharge
          const taxableAmount =
            calculatedSubtotal - discount_amount - bargainAmountValue + surchargeAmountValue;
          tax_amount = Math.round(Math.max(0, taxableAmount) * (tax_rate / 100));
        }
      } else if (parseFloat(String(frontendTaxRate ?? 0)) > 0) {
        console.warn('⚠️ VAT requested but URA compliance is off — charging no VAT');
      }
    } catch (error) {
      console.error('VAT setting fetch error:', error);
      tax_amount = 0;
      tax_rate = 0;
    }
    
    // 4. Calculate final total
    // Formula: subtotal - discount - bargain + surcharge + tax
    const total_amount = calculatedSubtotal - discount_amount - bargainAmountValue + surchargeAmountValue + tax_amount;
    
    // Use backend-calculated subtotal
    const subtotal = calculatedSubtotal;
    
    // Generate order number (format: ORD20260001)
    // Use MAX to avoid race conditions and handle deleted orders
    const maxOrderResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 8) AS INTEGER)), 0) as max_number 
       FROM orders 
       WHERE order_number LIKE $1`,
      [`ORD${new Date().getFullYear()}%`]
    );
    const nextNumber = parseInt(maxOrderResult.rows[0].max_number) + 1;
    const year = new Date().getFullYear();
    const order_number = `ORD${year}${String(nextNumber).padStart(4, '0')}`;
    
    // On Account = credit sale: force unpaid with zero amount paid
    let finalPaymentMethod = payment_method || 'CASH';
    let finalAmountPaidValue = Math.max(0, Number(amount_paid) || 0);
    const requestedStatus = String(payment_status || 'UNPAID').toUpperCase();

    if (finalPaymentMethod === 'ON_ACCOUNT') {
      finalAmountPaidValue = 0;
      console.log('💳 On Account selected — payment status forced to UNPAID');
    } else if (
      // Staff clicked Cash + Paid but left Amount Paid empty → treat as full payment received
      requestedStatus === 'PAID' &&
      finalAmountPaidValue <= 0 &&
      total_amount > 0
    ) {
      finalAmountPaidValue = total_amount;
      console.log(`💵 PAID with blank amount — auto-filled full payment UGX ${total_amount.toLocaleString()}`);
    }

    // Derive payment_status from amounts (source of truth)
    if (finalAmountPaidValue > total_amount) {
      const amountPaidDisplay = finalAmountPaidValue.toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      const totalDisplay = total_amount.toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      throw new Error(`Payment amount (UGX ${amountPaidDisplay}) exceeds the order total (UGX ${totalDisplay}). Maximum payment allowed is UGX ${totalDisplay}.`);
    }

    let finalPaymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
    if (finalAmountPaidValue <= 0) {
      finalPaymentStatus = 'UNPAID';
      finalAmountPaidValue = 0;
    } else if (finalAmountPaidValue >= total_amount && total_amount > 0) {
      finalPaymentStatus = 'PAID';
      finalAmountPaidValue = total_amount;
    } else if (total_amount <= 0) {
      finalPaymentStatus = 'UNPAID';
      finalAmountPaidValue = 0;
    } else {
      finalPaymentStatus = 'PARTIAL';
    }

    // Calculate balance
    const balance = Math.max(0, total_amount - finalAmountPaidValue);
    
    // Generate invoice number
    const invoiceMaxResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 10) AS INTEGER)), 0) as max_number 
       FROM orders 
       WHERE invoice_number LIKE $1`,
      [`INV-${year}-%`]
    );
    const nextInvoiceNumber = parseInt(invoiceMaxResult.rows[0].max_number) + 1;
    const invoice_number = `INV-${year}-${String(nextInvoiceNumber).padStart(6, '0')}`;
    
    // Create order
    const orderResult = await client.query(
      customOrderDate
        ? `INSERT INTO orders (
            order_number, customer_id, user_id, subtotal, tax_rate, tax_amount,
            discount_percentage, discount_amount, bargain_amount, surcharge_amount,
            total_amount, payment_status, payment_method, amount_paid, balance,
            status, transaction_reference, invoice_number, notes, branch_id, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
          RETURNING *`
        : `INSERT INTO orders (
            order_number, customer_id, user_id, subtotal, tax_rate, tax_amount,
            discount_percentage, discount_amount, bargain_amount, surcharge_amount,
            total_amount, payment_status, payment_method, amount_paid, balance,
            status, transaction_reference, invoice_number, notes, branch_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
          RETURNING *`,
      customOrderDate
        ? [
            order_number, customer_id, req.user!.id, subtotal, tax_rate, tax_amount,
            discount_percentage, discount_amount, bargainAmountValue, surchargeAmountValue,
            total_amount, finalPaymentStatus, finalPaymentMethod, finalAmountPaidValue,
            balance, 'pending', transaction_reference || null, invoice_number, notes, branchId,
            customOrderDate,
          ]
        : [
            order_number, customer_id, req.user!.id, subtotal, tax_rate, tax_amount,
            discount_percentage, discount_amount, bargainAmountValue, surchargeAmountValue,
            total_amount, finalPaymentStatus, finalPaymentMethod, finalAmountPaidValue,
            balance, 'pending', transaction_reference || null, invoice_number, notes, branchId,
          ]
    );
    
    const orderId = orderResult.rows[0].id;
    
    // Create order items using VALIDATED data from backend
    for (const item of validatedItems) {
      await client.query(
        `INSERT INTO order_items (
          order_id, 
          price_item_id, 
          service_type, 
          quantity, 
          unit_price, 
          discount_amount,
          surcharge_amount,
          total_price,
          notes
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          orderId, 
          item.price_item_id, 
          item.service_type.toUpperCase(), 
          item.quantity, 
          item.unit_price,
          item.discount_amount || 0,
          item.surcharge_amount || 0,
          item.total_price,
          item.notes
        ]
      );
    }
    
    // Always create a payments ledger row when money was received (links order ↔ Payments ↔ accounting)
    if (finalAmountPaidValue > 0 && finalPaymentMethod !== 'ON_ACCOUNT') {
      await client.query(
        `INSERT INTO payments (
          order_id,
          customer_id,
          amount,
          payment_method,
          transaction_reference,
          payment_date,
          notes,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)`,
        [
          orderId,
          customer_id,
          finalAmountPaidValue,
          finalPaymentMethod,
          transaction_reference || null,
          `Initial payment for order ${order_number}`,
          req.user!.id
        ]
      );
      console.log(`💰 Payment transaction created: ${finalPaymentMethod} - UGX ${finalAmountPaidValue.toLocaleString()} → order ${order_number}`);
    }
    
    await client.query('COMMIT');
    
    const createdOrder = orderResult.rows[0];
    
    // 💰 Notify admin if bargain deduction was used
    if (bargainAmountValue > 0) {
      try {
        // Get all admin users
        const admins = await client.query(
          `SELECT id FROM users WHERE role = 'ADMIN'`
        );

        // Get staff name who created the order
        const staffName = req.user!.full_name || req.user!.email;
        
        // Create notification for each admin
        for (const admin of admins.rows) {
          await client.query(
            `INSERT INTO notifications (user_id, type, title, message, link, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
              admin.id,
              'bargain_used',
              'Bargain Deduction Applied',
              `${staffName} applied a UGX ${bargainAmountValue.toLocaleString()} bargain deduction on order ${order_number}`,
              `/orders?order=${order_number}`,
            ]
          );
        }
        
        console.log(`🔔 Admin notified: ${staffName} used UGX ${bargainAmountValue.toLocaleString()} bargain on order ${order_number}`);
      } catch (notifError) {
        // Don't fail the order if notification fails
        console.error('⚠️ Failed to create bargain notification:', notifError);
      }
    }
    
    // Get customer details for SMS receipt
    const customerResult = await client.query(
      'SELECT name, phone FROM customers WHERE id = $1',
      [customer_id]
    );
    
    if (customerResult.rows.length > 0 && customerResult.rows[0].phone) {
      const customerName = customerResult.rows[0].name;
      const customerPhone = customerResult.rows[0].phone;
      
      const receiptItemsResult = await client.query(
        `SELECT oi.quantity, oi.unit_price, oi.discount_amount, oi.total_price, pi.name as item_name
         FROM order_items oi
         JOIN price_items pi ON oi.price_item_id = pi.id
         WHERE oi.order_id = $1`,
        [orderId]
      );

      const receiptItems = receiptItemsResult.rows.map((item: any) => ({
        name: item.item_name || 'Item',
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unit_price) || 0,
        discountAmount: Number(item.discount_amount) || 0,
        totalPrice: Number(item.total_price) || 0,
      }));

      // Prepare order details for receipt with proper item names
      const orderDetails = {
        items: receiptItems,
        subtotal,
        orderDiscountAmount: discount_amount,
        bargainAmount: bargainAmountValue,
        taxAmount: tax_amount,
        total: total_amount,
        amountPaid: finalAmountPaidValue,
        balance,
        pickupDate: pickup_date ? new Date(pickup_date).toLocaleDateString() : 'TBD',
        orderStatus: createdOrder.status,
        paymentStatus: finalPaymentStatus,
      };
      
      // 🔥 Check automation setting before sending WhatsApp order confirmation
      const automationCheck = await query(
        `SELECT setting_value FROM automation_settings WHERE setting_key = 'whatsapp_auto_send_receipt'`
      );
      const autoSendReceipt = automationCheck.rows[0]?.setting_value ?? true;
      
      if (autoSendReceipt) {
        const customerId = customer_id; // Store before client is released
        sendOrderConfirmation(customerName, customerPhone, order_number, orderDetails)
          .then(async (result: any) => {
            if (result.success) {
              console.log(`✅ WhatsApp confirmation sent for order ${order_number}`);
              
              // Save message to database (use standalone query, not client)
              try {
                await query(
                  `INSERT INTO whatsapp_messages 
                   (customer_id, phone_number, message_text, message_type, status, whatsapp_message_id, cost_ugx)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                  [
                    customerId,
                    customerPhone,
                    `Order confirmation for ${order_number}`,
                    'order_confirmation',
                    'sent',
                    result.messageId,
                    193.00
                  ]
                );
                console.log(`✅ Message logged to database for order ${order_number}`);
              } catch (dbError) {
                console.error(`❌ Database error logging message:`, dbError);
              }
            } else {
              console.error(`❌ WhatsApp failed for order ${order_number}:`, result.error);
            }
          })
          .catch((error: any) => {
            console.error(`❌ WhatsApp error for order ${order_number}:`, error);
          });
      } else {
        console.log(`ℹ️ Automation disabled - WhatsApp confirmation NOT sent for order ${order_number}`);
      }
      
      // Calculate pickup date (3 days from now)
      const pickupDate = new Date();
      pickupDate.setDate(pickupDate.getDate() + 3);
      
      // Generate PDF receipt asynchronously
      console.log(`📄 Generating PDF receipt for ${order_number}`);
      
      generateOrderReceiptPDF({
        orderNumber: order_number,
        customerName,
        customerPhone,
        orderDate: new Date(),
        pickupDate,
        items: receiptItems,
        subtotal,
        orderDiscountAmount: discount_amount,
        bargainAmount: bargainAmountValue,
        taxAmount: tax_amount,
        total: total_amount,
        amountPaid: finalAmountPaidValue,
        balance,
        paymentStatus: finalPaymentStatus,
        orderStatus: createdOrder.status,
      })
        .then(async (pdfPath) => {
          console.log(`✅ PDF receipt generated: ${pdfPath}`);
          
          // TODO: Upload PDF to public URL (ngrok, S3, or temp hosting)
          // For now, send WhatsApp with PDF disabled (Twilio sandbox limitation)
          const pdfUrl = undefined; // Set this when you have public PDF hosting
          
          // The WhatsApp confirmation was already sent above with receipt details
          // This PDF is for future attachment capability
          
          // Send text receipt via SMS as backup
          sendOrderReceipt(
            customerPhone,
            order_number,
            customerName,
            {
              items: receiptItems,
              subtotal,
              orderDiscountAmount: discount_amount,
              bargainAmount: bargainAmountValue,
              taxAmount: tax_amount,
              total: total_amount,
              amountPaid: finalAmountPaidValue,
              balance,
              paymentStatus: finalPaymentStatus,
              orderStatus: createdOrder.status,
            }
          ).then((sent) => {
            if (sent) {
              console.log(`✅ SMS backup receipt sent for ${order_number}`);
            }
          }).catch((error: any) => {
            console.error(`❌ SMS receipt failed:`, error);
          });
          
          // Clean up PDF file after delay
          setTimeout(() => {
            try {
              fs.unlinkSync(pdfPath);
              console.log(`🗑️ Cleaned up PDF: ${pdfPath}`);
            } catch (err) {
              console.error(`⚠️ Failed to delete PDF: ${err}`);
            }
          }, 30000);
        })
        .catch((error: any) => {
          console.error(`❌ Failed to generate/send receipt for ${order_number}:`, error);
        });
    }

    // Create payment notification for mobile money or bank transfer
    if ((payment_method.includes('MOBILE_MONEY') || payment_method === 'BANK_TRANSFER') && amount_paid > 0) {
      const paymentMethodDisplay = payment_method.includes('MTN') ? 'MTN Mobile Money' :
                                   payment_method.includes('AIRTEL') ? 'Airtel Money' :
                                   'Bank Transfer';

      // Notify all admins and the cashier
      const usersToNotify = await client.query(
        `SELECT id FROM users WHERE role IN ('ADMIN', 'DESKTOP_AGENT')`
      );

      const notificationMessage = `Payment of UGX ${amount_paid.toLocaleString()} received via ${paymentMethodDisplay} for order ${order_number}${transaction_reference ? ` (Ref: ${transaction_reference})` : ''}`;

      for (const user of usersToNotify.rows) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message, link, created_at)
           VALUES ($1, 'payment', 'Payment Received', $2, '/orders', NOW())`,
          [user.id, notificationMessage]
        );
      }

      console.log(`✅ Payment notifications sent for order ${order_number}`);
    }
    
    // Log order creation for audit trail
    await logCreate(
      req.user!.id,
      req.user!.email,
      req.user!.full_name,
      req.user!.role,
      'order',
      orderId,
      { 
        order_number,
        customer_id,
        total_amount,
        items: validatedItems.length,
        payment_status
      },
      req.ip
    );
    
    res.status(201).json({
      message: 'Order created successfully',
      order: { ...createdOrder, item_discount_total: totalItemDiscount },
    });
    
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Create order error:', error);
    const message = error?.message || 'Failed to create order';
    const statusCode = error?.message && !error?.code ? 400 : 500;
    res.status(statusCode).json({ error: message });
  } finally {
    client.release();
  }
};

export const updateOrder = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { id } = req.params;
    const { 
      status: order_status, 
      payment_status, 
      payment_method, 
      amount_paid, 
      balance,
      pickup_date, 
      discount_percentage,
      discount_amount,
      notes,
      transaction_reference
    } = req.body;

    // Cancelling is an administrator action. This generic update route must not
    // become a side door around the same rule enforced in updateOrderStatus.
    if (
      order_status &&
      String(order_status).toLowerCase() === 'cancelled' &&
      req.user!.role !== 'ADMIN'
    ) {
      return res.status(403).json({
        error: 'Only administrators can cancel an order',
      });
    }

    // Parse numeric values properly (handle both integer and decimal inputs)
    // Database columns: subtotal, discount, tax, total, amount_paid are DECIMAL
    // Validate and cap values to prevent overflow
    const MAX_DECIMAL_VALUE = 999999999.99; // Max for DECIMAL(10,2)
    
    const parseAndValidateAmount = (value: any, fieldName: string): number | undefined => {
      if (value === undefined || value === null) return undefined;
      const parsed = parseFloat(value);
      if (isNaN(parsed)) {
        throw new Error(`Invalid ${fieldName}: ${value}`);
      }
      if (parsed > MAX_DECIMAL_VALUE) {
        throw new Error(`${fieldName} exceeds maximum allowed value (${MAX_DECIMAL_VALUE})`);
      }
      if (parsed < 0) {
        throw new Error(`${fieldName} cannot be negative`);
      }
      return parsed;
    };
    
    const parsedAmountPaid = parseAndValidateAmount(amount_paid, 'amount_paid');
    const parsedBalance = parseAndValidateAmount(balance, 'balance');
    const parsedDiscountAmount = parseAndValidateAmount(discount_amount, 'discount_amount');
    const parsedDiscountPercentage = discount_percentage !== undefined ? parseFloat(discount_percentage) : undefined;

    // Get the current order to check if payment amount changed
    const currentOrderResult = await query('SELECT * FROM orders WHERE id = $1', [id]);
    if (currentOrderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const currentOrder = currentOrderResult.rows[0];

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (order_status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(order_status);
    }
    if (payment_method !== undefined) {
      updates.push(`payment_method = $${paramCount++}`);
      values.push(payment_method);
    }
    if (transaction_reference !== undefined) {
      updates.push(`transaction_reference = $${paramCount++}`);
      values.push(transaction_reference);
    }

    // When amount_paid changes (or payment_status sent alone), derive status from money
    const nextAmountPaid = parsedAmountPaid !== undefined
      ? parsedAmountPaid
      : Number(currentOrder.amount_paid) || 0;
    const orderTotal = Number(currentOrder.total_amount) || 0;

    if (parsedAmountPaid !== undefined || payment_status !== undefined) {
      let derivedStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
      let cappedPaid = Math.max(0, nextAmountPaid);

      if (cappedPaid <= 0) {
        derivedStatus = 'UNPAID';
        cappedPaid = 0;
      } else if (orderTotal > 0 && cappedPaid >= orderTotal) {
        derivedStatus = 'PAID';
        cappedPaid = orderTotal;
      } else if (orderTotal <= 0) {
        derivedStatus = 'UNPAID';
        cappedPaid = 0;
      } else {
        derivedStatus = 'PARTIAL';
      }

      // Reject fake PAID with zero paid
      if (payment_status === 'PAID' && cappedPaid <= 0) {
        return res.status(400).json({
          error: 'Cannot mark order as PAID with UGX 0 paid. Use Add Payment to record a payment first.',
        });
      }

      updates.push(`amount_paid = $${paramCount++}`);
      values.push(cappedPaid);
      updates.push(`payment_status = $${paramCount++}`);
      values.push(derivedStatus);
      updates.push(`balance = $${paramCount++}`);
      values.push(Math.max(0, orderTotal - cappedPaid));
    } else if (parsedBalance !== undefined) {
      updates.push(`balance = $${paramCount++}`);
      values.push(parsedBalance);
    }
    if (pickup_date !== undefined) {
      updates.push(`pickup_date = $${paramCount++}`);
      values.push(pickup_date);
    }
    if (parsedDiscountPercentage !== undefined) {
      updates.push(`discount_percentage = $${paramCount++}`);
      values.push(parsedDiscountPercentage);
    }
    if (parsedDiscountAmount !== undefined) {
      updates.push(`discount_amount = $${paramCount++}`);
      values.push(parsedDiscountAmount);
      
      // CRITICAL: Recalculate total_amount when discount changes
      // Formula: total = subtotal + tax - discount
      const newTotal = currentOrder.subtotal + (currentOrder.tax_amount || 0) - discount_amount;
      updates.push(`total_amount = $${paramCount++}`);
      values.push(newTotal);
      
      // Recalculate balance = total - amount_paid
      const currentAmountPaid = parsedAmountPaid !== undefined ? parsedAmountPaid : currentOrder.amount_paid;
      const newBalance = newTotal - currentAmountPaid;
      updates.push(`balance = $${paramCount++}`);
      values.push(newBalance);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(notes);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    
    const result = await query(
      `UPDATE orders SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const updatedOrder = result.rows[0];

    // If payment was added (amount_paid increased), create a payment transaction record
    if (parsedAmountPaid !== undefined && parsedAmountPaid > currentOrder.amount_paid) {
      const paymentAmount = parsedAmountPaid - currentOrder.amount_paid;
      const userId = req.user?.id;

      try {
        await query(`
          INSERT INTO payments (
            order_id,
            customer_id,
            amount,
            payment_method,
            transaction_reference,
            payment_date,
            notes,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)
        `, [
          id,
          updatedOrder.customer_id,
          paymentAmount,
          payment_method || currentOrder.payment_method || 'CASH',
          transaction_reference || null,
          notes ? `Manual payment: ${notes}` : 'Manual payment added to order',
          userId
        ]);

        console.log(`✅ Payment transaction record created: ${paymentAmount} for order ${id}`);
      } catch (paymentError) {
        console.error('Error creating payment record:', paymentError);
        // Don't fail the order update if payment record fails
      }
    }
    
    // Log order update for audit trail
    await logUpdate(
      req.user!.id,
      req.user!.email,
      req.user!.full_name,
      req.user!.role,
      'order',
      parseInt(id),
      { 
        status: order_status,
        payment_status,
        amount_paid: amount_paid || currentOrder.amount_paid,
        balance: balance || updatedOrder.balance,
        updated_fields: Object.keys(req.body)
      },
      req.ip
    );
    
    res.json({
      message: 'Order updated successfully',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
};

export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { id } = req.params;
    const { status } = req.body;
    
    // Get order details with customer info before updating
    const orderBeforeUpdate = await query(
      `SELECT o.*, c.name as customer_name, c.phone as customer_phone 
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       WHERE o.id = $1`,
      [id]
    );
    
    if (orderBeforeUpdate.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const oldStatus = orderBeforeUpdate.rows[0].status;
    const orderNumber = orderBeforeUpdate.rows[0].order_number;
    const customerName = orderBeforeUpdate.rows[0].customer_name;
    const customerPhone = orderBeforeUpdate.rows[0].customer_phone;
    
    console.log(`🔄 Status Update: ${orderNumber} from ${oldStatus} to ${status}`);
    console.log(`📞 Customer: ${customerName}, Phone: ${customerPhone}`);
    
    // Convert status to lowercase to match database enum (pending, processing, ready, delivered, cancelled)
    const dbStatus = status.toLowerCase();
    
    // BUSINESS RULE: Only ADMIN can cancel orders
    if (dbStatus === 'cancelled' && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ 
        error: 'Only administrators can cancel orders',
        businessRule: 'CANCELLATION_RESTRICTED',
        requiredRole: 'ADMIN',
        yourRole: req.user?.role
      });
    }
    
    // Auto-update pickup_date when status changes to DELIVERED
    let updateQuery = 'UPDATE orders SET status = $1';
    const updateValues: any[] = [dbStatus];
    let paramCount = 2;
    
    if (dbStatus === 'delivered' && oldStatus !== 'delivered') {
      updateQuery += `, pickup_date = CURRENT_TIMESTAMP`;
      console.log(`📅 Auto-updating pickup_date to current timestamp for DELIVERED order`);
    }
    
    updateQuery += ` WHERE id = $${paramCount} RETURNING *`;
    updateValues.push(id);
    
    // Update order status
    const result = await query(updateQuery, updateValues);
    
    // Send SMS notification if status changed to READY
    if (oldStatus !== 'ready' && dbStatus === 'ready' && customerPhone) {
      console.log(`📱 Sending notifications for order ${orderNumber} to ${customerPhone}`);
      
      // Get order total and payment details
      const totalAmount = orderBeforeUpdate.rows[0].total_amount;
      const amountPaid = orderBeforeUpdate.rows[0].amount_paid || 0;
      const balance = totalAmount - amountPaid;
      const paymentStatus = orderBeforeUpdate.rows[0].payment_status || 'UNPAID';
      const orderDate = new Date(orderBeforeUpdate.rows[0].created_at).toLocaleDateString();
      
      // Get order items for WhatsApp message
      const orderItems = await query(
        `SELECT oi.quantity, pi.name as item_name
         FROM order_items oi
         JOIN price_items pi ON oi.price_item_id = pi.id
         WHERE oi.order_id = $1`,
        [id]
      );
      
      const items = orderItems.rows.map((item: any) => ({
        name: item.item_name,
        quantity: item.quantity
      }));
      
      // Send SMS notification
      sendOrderReadyNotification(
        customerPhone,
        orderNumber,
        customerName,
        paymentStatus,
        balance,
        ['cash', 'MTN Mobile Money', 'Airtel Money', 'bank transfer']
      )
        .then((sent) => {
          if (sent) {
            console.log(`✅ SMS notification sent for order ${orderNumber}`);
          } else {
            console.log(`ℹ️ SMS notification skipped for order ${orderNumber} (SMS disabled or failed)`);
          }
        })
        .catch((error: any) => {
          console.error(`❌ Failed to send SMS for order ${orderNumber}:`, error);
        });
      
      // Check automation setting before sending WhatsApp ready notification
      const automationCheck = await query(
        `SELECT setting_value FROM automation_settings WHERE setting_key = 'whatsapp_auto_send_ready'`
      );
      const autoSendReady = automationCheck.rows[0]?.setting_value ?? true;
      
      if (autoSendReady) {
        // Send WhatsApp ready notification with order details
        sendOrderReady(
          customerName,
          customerPhone,
          orderNumber,
          {
            items,
            orderDate,
            totalAmount,
            amountPaid,
            balance
          }
        )
          .then(async (result: any) => {
            if (result.success) {
              console.log(`✅ WhatsApp ready notification sent for order ${orderNumber}`);
              
              // Save to database
              try {
                await query(
                  `INSERT INTO whatsapp_messages 
                   (customer_id, phone_number, message_text, message_type, status, whatsapp_message_id, cost_ugx)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                  [
                    orderBeforeUpdate.rows[0].customer_id,
                    customerPhone,
                    `Order ready notification for ${orderNumber}`,
                    'order_ready',
                    'sent',
                    result.messageId,
                    193.00
                  ]
                );
                console.log(`✅ WhatsApp message logged to database`);
              } catch (dbError) {
                console.error(`❌ Database error:`, dbError);
              }
            } else {
              console.error(`❌ WhatsApp failed for order ${orderNumber}:`, result.error);
            }
          })
          .catch((error: any) => {
            console.error(`❌ WhatsApp error for order ${orderNumber}:`, error);
          });
      } else {
        console.log(`ℹ️ Automation disabled - WhatsApp ready notification NOT sent for order ${orderNumber}`);
      }
    }

    if (oldStatus !== 'delivered' && dbStatus === 'delivered' && customerPhone) {
      console.log(`📱 Sending delivered notification for order ${orderNumber} to ${customerPhone}`);

      const totalAmount = orderBeforeUpdate.rows[0].total_amount;
      const amountPaid = orderBeforeUpdate.rows[0].amount_paid || 0;
      const balance = totalAmount - amountPaid;
      const paymentStatus = orderBeforeUpdate.rows[0].payment_status || 'UNPAID';

      sendOrderDeliveredNotification(
        customerPhone,
        orderNumber,
        customerName,
        paymentStatus,
        balance,
        ['cash', 'MTN Mobile Money', 'Airtel Money', 'bank transfer']
      )
        .then((sent) => {
          if (sent) {
            console.log(`✅ SMS delivered notification sent for order ${orderNumber}`);
          } else {
            console.log(`ℹ️ SMS delivered notification skipped for order ${orderNumber} (SMS disabled or failed)`);
          }
        })
        .catch((error: any) => {
          console.error(`❌ Failed to send delivered SMS for order ${orderNumber}:`, error);
        });
    }
    
    res.json({
      message: 'Order status updated successfully',
      order: result.rows[0],
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
};

export const deleteOrder = async (req: AuthRequest, res: Response) => {
  const client = await getClient();
  
  try {
    const { id } = req.params;
    const { deletion_reason } = req.body;
    const userId = req.user?.id;
    const userName = req.user?.full_name || 'Administrator';
    
    await client.query('BEGIN');
    
    // Get complete order details with customer info
    const orderCheck = await client.query(
      `SELECT o.*, c.name as customer_name 
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       WHERE o.id = $1`,
      [id]
    );
    
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderCheck.rows[0];
    
    // BUSINESS RULE: Only ADMIN can delete, and ONLY if status is CANCELLED
    if (order.status !== 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Cannot delete order #${order.order_number}. Only CANCELLED orders can be deleted.`,
        currentStatus: order.status,
        businessRule: 'DELETION_REQUIRES_CANCELLATION',
        suggestion: 'First cancel the order, then delete it'
      });
    }
    
    // Get order items for audit trail
    const orderItems = await client.query(
      `SELECT oi.*, pi.name as item_name
       FROM order_items oi
       JOIN price_items pi ON oi.price_item_id = pi.id
       WHERE oi.order_id = $1`,
      [id]
    );
    
    // Get payments for audit trail
    const payments = await client.query(
      `SELECT * FROM payments WHERE order_id = $1`,
      [id]
    );
    
    // Create audit record in order_deletions table
    // CRITICAL: Convert money values to integers (never floats)
    const totalAmount = parseInt(order.total_amount) || 0;
    const amountPaid = parseInt(order.amount_paid) || 0;
    const balance = totalAmount - amountPaid;
    
    await client.query(
      `INSERT INTO order_deletions (
        order_id, order_number, customer_id, customer_name,
        total_amount, amount_paid, balance, payment_status, status,
        created_at, cancelled_at, deleted_by, deleted_by_name,
        deletion_reason, order_items, payments
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        order.id,
        order.order_number,
        order.customer_id,
        order.customer_name,
        totalAmount,
        amountPaid,
        balance,
        order.payment_status,
        order.status,
        order.created_at,
        order.updated_at, // Approximation of when it was cancelled
        userId,
        userName,
        deletion_reason || 'No reason provided',
        JSON.stringify(orderItems.rows),
        JSON.stringify(payments.rows)
      ]
    );
    
    console.log(`🗑️ Deleting order #${order.order_number}`);
    console.log(`💰 Financial Impact: Total=${totalAmount}, Paid=${amountPaid}, Balance=${balance}`);
    
    // Delete order (cascade will handle order_items and payments)
    await client.query('DELETE FROM orders WHERE id = $1', [id]);
    
    // Log the deletion for activity tracking
    await logDelete(
      userId!,
      req.user?.email || 'unknown',
      userName,
      req.user?.role || 'ADMIN',
      'orders',
      parseInt(id),
      {
        order_number: order.order_number,
        customer_name: order.customer_name,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        balance: balance,
        deletion_reason
      }
    );
    
    await client.query('COMMIT');
    
    console.log(`✅ Order #${order.order_number} deleted and archived`);
    
    res.json({ 
      message: `Order #${order.order_number} deleted successfully`,
      archivedTo: 'order_deletions',
      financialImpact: {
        totalAmount: totalAmount,
        amountPaid: amountPaid,
        balance: balance
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete order error:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  } finally {
    client.release();
  }
};

// Get order statistics for a specific year
export const getOrderStats = async (req: AuthRequest, res: Response) => {
  try {
    const { year, status, payment_status } = req.query;
    
    if (!year) {
      return res.status(400).json({ error: 'Year is required' });
    }

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const sql = `
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total_amount
      FROM orders
      WHERE 
        created_at >= $1 
        AND created_at <= $2
        AND status = $3
        AND payment_status = $4
    `;

    const result = await query(sql, [startDate, endDate, status || 'DELIVERED', payment_status || 'PAID']);

    res.json({
      count: parseInt(result.rows[0].count),
      totalAmount: parseFloat(result.rows[0].total_amount)
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ error: 'Failed to get order statistics' });
  }
};

// Bulk delete old orders (admin only - PAID and DELIVERED only)
export const bulkDeleteOrders = async (req: AuthRequest, res: Response) => {
  const client = await getClient();
  
  try {
    const { year } = req.body;
    
    if (!year) {
      return res.status(400).json({ error: 'Year is required' });
    }

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    await client.query('BEGIN');

    // Only delete PAID and DELIVERED orders
    const deleteSql = `
      DELETE FROM orders
      WHERE 
        created_at >= $1 
        AND created_at <= $2
        AND status = 'DELIVERED'
        AND payment_status = 'PAID'
      RETURNING id
    `;

    const result = await client.query(deleteSql, [startDate, endDate]);
    const deletedCount = result.rowCount || 0;

    // Note: order_items will be automatically deleted via CASCADE foreign key

    await client.query('COMMIT');

    res.json({ 
      message: `Successfully deleted ${deletedCount} completed orders`,
      count: deletedCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Bulk delete orders error:', error);
    res.status(500).json({ error: 'Failed to delete orders' });
  } finally {
    client.release();
  }
};

// Get deleted orders audit log (ADMIN only)
export const getDeletedOrders = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, from_date, to_date, customer_id } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const values: any[] = [];
    let paramCount = 1;
    
    if (from_date) {
      whereClause += ` AND deleted_at >= $${paramCount++}`;
      values.push(from_date);
    }
    
    if (to_date) {
      whereClause += ` AND deleted_at <= $${paramCount++}`;
      values.push(to_date);
    }
    
    if (customer_id) {
      whereClause += ` AND customer_id = $${paramCount++}`;
      values.push(customer_id);
    }
    
    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM order_deletions ${whereClause}`,
      values
    );
    const totalCount = parseInt(countResult.rows[0].total);
    
    // Calculate pagination
    const offset = (Number(page) - 1) * Number(limit);
    values.push(Number(limit), offset);
    
    // Get deleted orders with pagination
    const result = await query(
      `SELECT 
        od.*,
        u.full_name as deleted_by_full_name,
        u.email as deleted_by_email
       FROM order_deletions od
       LEFT JOIN users u ON od.deleted_by = u.id
       ${whereClause}
       ORDER BY od.deleted_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );
    
    res.json({
      deletedOrders: result.rows,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(limit)),
        totalCount,
        limit: Number(limit)
      }
    });
  } catch (error) {
    console.error('Get deleted orders error:', error);
    res.status(500).json({ error: 'Failed to get deleted orders' });
  }
};

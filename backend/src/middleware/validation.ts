import { body, param, query, ValidationChain } from 'express-validator';
import { UserRole } from '../models/User';
import { OrderStatus } from '../models/Order';
import { PriceCategory, PriceUnit } from '../models/PriceItem';

export const authValidation = {
  register: [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('full_name').trim().notEmpty().withMessage('Full name is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('role').optional().isIn(Object.values(UserRole)),
  ],
  
  login: [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
};

export const userValidation = {
  update: [
    param('id').isInt().toInt(),
    body('email').optional().isEmail().normalizeEmail(),
    body('full_name').optional().trim().notEmpty(),
    body('phone').optional().trim().notEmpty(),
  ],
  
  changeRole: [
    param('id').isInt().toInt(),
    body('role').isIn(Object.values(UserRole)),
  ],
  
  approve: [
    param('id').isInt().toInt(),
  ],
};

const phoneWithCountryCode = body('phone')
  .trim()
  .notEmpty()
  .withMessage('Phone number is required')
  .custom((value) => {
    // Soft check: must look like it has / can resolve to a country code
    const raw = String(value || '').trim();
    const digits = raw.replace(/\D/g, '');
    const hasPlus = raw.startsWith('+');
    const isUgLocal =
      (digits.startsWith('0') && digits.length === 10) ||
      (digits.startsWith('7') && digits.length === 9) ||
      (digits.startsWith('256') && digits.length === 12);
    if (hasPlus && digits.length >= 8 && digits.length <= 15) return true;
    if (isUgLocal) return true;
    throw new Error('Please include the country code (e.g. +256700123456 for Uganda)');
  });

/** Soft caps — optional fields never required; empty is allowed */
export const CUSTOMER_FIELD_LIMITS = {
  name: 255,
  location: 200,
  notes: 500,
} as const;

export const customerValidation = {
  create: [
    // Names are free-form (any case, letters, symbols) — only require non-empty
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Customer name is required')
      .isLength({ max: CUSTOMER_FIELD_LIMITS.name })
      .withMessage(`Customer name must be at most ${CUSTOMER_FIELD_LIMITS.name} characters`),
    phoneWithCountryCode,
    body('email').optional({ nullable: true, checkFalsy: true }).isEmail().normalizeEmail(),
    // Location & notes are optional — blank must never block create/update
    body('location')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: CUSTOMER_FIELD_LIMITS.location })
      .withMessage(`Location must be at most ${CUSTOMER_FIELD_LIMITS.location} characters`),
    body('notes')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: CUSTOMER_FIELD_LIMITS.notes })
      .withMessage(`Notes must be at most ${CUSTOMER_FIELD_LIMITS.notes} characters`),
  ],
  
  update: [
    param('id').isInt().toInt(),
    body('name')
      .optional({ checkFalsy: true })
      .trim()
      .notEmpty()
      .withMessage('Customer name is required')
      .isLength({ max: CUSTOMER_FIELD_LIMITS.name })
      .withMessage(`Customer name must be at most ${CUSTOMER_FIELD_LIMITS.name} characters`),
    body('phone')
      .optional({ checkFalsy: true })
      .trim()
      .notEmpty()
      .withMessage('Phone number is required')
      .custom((value) => {
        const raw = String(value || '').trim();
        const digits = raw.replace(/\D/g, '');
        const hasPlus = raw.startsWith('+');
        const isUgLocal =
          (digits.startsWith('0') && digits.length === 10) ||
          (digits.startsWith('7') && digits.length === 9) ||
          (digits.startsWith('256') && digits.length === 12);
        if (hasPlus && digits.length >= 8 && digits.length <= 15) return true;
        if (isUgLocal) return true;
        throw new Error('Please include the country code (e.g. +256700123456 for Uganda)');
      }),
    // Empty email on edit must not fail isEmail
    body('email').optional({ nullable: true, checkFalsy: true }).isEmail().normalizeEmail(),
    body('location')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: CUSTOMER_FIELD_LIMITS.location })
      .withMessage(`Location must be at most ${CUSTOMER_FIELD_LIMITS.location} characters`),
    body('notes')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: CUSTOMER_FIELD_LIMITS.notes })
      .withMessage(`Notes must be at most ${CUSTOMER_FIELD_LIMITS.notes} characters`),
  ],
};

export const priceValidation = {
  create: [
    body('item_id').optional({ values: 'falsy' }).trim(),
    body('name').trim().notEmpty().withMessage('Item name is required'),
    body('category').isIn(Object.values(PriceCategory)).withMessage('Invalid category'),
    body('subcategory').optional().trim(),
    body('unit').optional().isIn(Object.values(PriceUnit)).withMessage('Invalid unit'),
    body('price').isInt({ min: 0 }).withMessage('Price must be a positive number'),
    body('ironing_price').optional().isInt({ min: 0 }).withMessage('Ironing price must be a positive number'),
    body('express_price').optional({ nullable: true }).isInt({ min: 0 }),
  ],
  
  update: [
    param('id').isInt().toInt(),
    body('name').optional().trim().notEmpty(),
    body('category').optional().isIn(Object.values(PriceCategory)),
    body('subcategory').optional().trim(),
    body('unit').optional().isIn(Object.values(PriceUnit)),
    body('price').optional().isInt({ min: 0 }),
    body('ironing_price').optional().isInt({ min: 0 }),
    body('express_price').optional({ nullable: true }).isInt({ min: 0 }),
    body('is_active').optional().isBoolean(),
  ],
};

export const orderValidation = {
  create: [
    body('customer_id').isInt({ min: 1 }).withMessage('Customer ID is required'),
    body('due_date').optional().isISO8601(),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.price_item_id').isInt({ min: 1 }),
    body('items.*.service_type').isIn(['WASH', 'IRON', 'EXPRESS']),
    body('items.*.quantity').isFloat({ min: 0.1 }),
    body('items.*.discount_amount').optional({ nullable: true }).isFloat({ min: 0 })
      .withMessage('Item discount cannot be negative'),
    body('items.*.notes').optional({ nullable: true }).isString().isLength({ max: 200 })
      .withMessage('Item note cannot exceed 200 characters'),
    body('discount').optional().isInt({ min: 0 }),
    body('notes').optional().trim(),
    body('order_date').optional({ nullable: true, checkFalsy: true })
      .matches(/^\d{4}-\d{2}-\d{2}/)
      .withMessage('Order date must be YYYY-MM-DD'),
    body('payment_date').optional({ nullable: true, checkFalsy: true })
      .matches(/^\d{4}-\d{2}-\d{2}/)
      .withMessage('Payment date must be YYYY-MM-DD'),
  ],
  
  update: [
    param('id').isInt().toInt(),
    body('status').optional().isIn(Object.values(OrderStatus)),
    body('due_date').optional().isISO8601(),
    body('discount').optional().isInt({ min: 0 }),
    body('notes').optional().trim(),
    body('payment_date').optional({ nullable: true, checkFalsy: true })
      .matches(/^\d{4}-\d{2}-\d{2}/)
      .withMessage('Payment date must be YYYY-MM-DD'),
  ],
  
  updateStatus: [
    param('id').isInt().toInt(),
    body('status').isIn(Object.values(OrderStatus)),
  ],
};

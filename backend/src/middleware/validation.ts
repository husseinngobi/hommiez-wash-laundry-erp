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

export const customerValidation = {
  create: [
    body('name').trim().notEmpty().withMessage('Customer name is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('email').optional({ nullable: true, checkFalsy: true }).isEmail().normalizeEmail(),
    body('location').optional({ nullable: true, checkFalsy: true }).trim(),
    body('notes').optional({ nullable: true, checkFalsy: true }).trim(),
  ],
  
  update: [
    param('id').isInt().toInt(),
    body('name').optional().trim().notEmpty(),
    body('phone').optional().trim().notEmpty(),
    body('email').optional().isEmail().normalizeEmail(),
    body('location').optional().trim(),
    body('notes').optional().trim(),
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
    body('discount').optional().isInt({ min: 0 }),
    body('notes').optional().trim(),
  ],
  
  update: [
    param('id').isInt().toInt(),
    body('status').optional().isIn(Object.values(OrderStatus)),
    body('due_date').optional().isISO8601(),
    body('discount').optional().isInt({ min: 0 }),
    body('notes').optional().trim(),
  ],
  
  updateStatus: [
    param('id').isInt().toInt(),
    body('status').isIn(Object.values(OrderStatus)),
  ],
};

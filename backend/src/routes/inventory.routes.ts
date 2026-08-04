import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { requireAdminOrManager, requireAdmin } from '../middleware/permissions';
import {
  getAllInventoryItems,
  addStock,
  recordUsage,
  getTransactions,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  renameInventoryCategory,
} from '../controllers/inventory.controller';

const router = express.Router();

// All inventory routes require authentication
router.use(authenticate as any);

// Read operations: all authenticated roles (including DESKTOP_AGENT)
router.get('/', getAllInventoryItems as any);
router.get('/transactions', getTransactions as any);

// Stock operations: all authenticated roles can restock / record usage
router.post(
  '/restock',
  [
    body('item_id').isInt({ min: 1 }),
    body('quantity').isFloat({ min: 0.01 }),
    body('unit_cost').optional().isFloat({ min: 0 }),
  ],
  addStock as any
);

router.post(
  '/usage',
  [
    body('item_id').isInt({ min: 1 }),
    body('quantity').isFloat({ min: 0.01 }),
    body('order_id').optional().isInt(),
  ],
  recordUsage as any
);

// Create / Update / Delete: admin or manager only
router.post(
  '/',
  requireAdminOrManager as any,
  [
    body('item_name').trim().notEmpty().withMessage('Item name is required'),
    body('unit').trim().notEmpty().withMessage('Unit is required'),
    body('reorder_level').optional().isNumeric().withMessage('Reorder level must be a number'),
    body('unit_cost').optional().isNumeric().withMessage('Unit cost must be a number'),
    body('quantity').optional().isNumeric().withMessage('Quantity must be a number'),
    body('category').optional().trim(),
    body('supplier').optional().trim(),
    body('notes').optional().trim(),
  ],
  createInventoryItem as any
);

router.put('/:id', requireAdminOrManager as any, updateInventoryItem as any);

// Rename a category: admin/manager only
router.put('/categories/:name', requireAdminOrManager as any, renameInventoryCategory as any);

// Delete: admin only (managers cannot delete)
router.delete('/:id', requireAdmin as any, deleteInventoryItem as any);

export default router;

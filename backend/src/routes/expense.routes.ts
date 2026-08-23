import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, requireAdmin, requireAdminOrManager } from '../middleware/auth';
import {
  recordExpense,
  getAllExpenses,
  getExpenseById,
  updateExpense,
  approveExpense,
  deleteExpense,
  getExpenseCategories,
  getExpenseStatistics,
} from '../controllers/expense.controller';

const router = Router();

// All routes require authentication
router.use(authenticate as any);

/**
 * @route   POST /api/expenses
 * @desc    Record new expense
 * @access  Authenticated users
 */
router.post(
  '/',
  [
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount required'),
    body('category_id').optional().isInt().withMessage('Valid category ID required'),
    body('payment_method')
      .optional()
      .isIn(['CASH', 'MOBILE_MONEY', 'MTN_MOBILE_MONEY', 'AIRTEL_MONEY', 'BANK_TRANSFER', 'CENTENARY', 'CARD'])
      .withMessage('Invalid payment method'),
  ],
  recordExpense as any
);

/**
 * @route   GET /api/expenses
 * @desc    Get all expenses with filters
 * @access  Authenticated users
 */
router.get('/', getAllExpenses as any);

/**
 * @route   GET /api/expenses/categories
 * @desc    Get all expense categories
 * @access  Authenticated users
 */
router.get('/categories', getExpenseCategories as any);

/**
 * @route   GET /api/expenses/statistics
 * @desc    Get expense statistics
 * @access  Admin only
 */
router.get('/statistics', requireAdmin as any, getExpenseStatistics as any);

/**
 * @route   GET /api/expenses/:id
 * @desc    Get expense by ID
 * @access  Authenticated users
 */
router.get('/:id', getExpenseById as any);

/**
 * @route   PUT /api/expenses/:id
 * @desc    Update expense (only if not approved)
 * @access  Authenticated users
 */
router.put(
  '/:id',
  [
    body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
    body('amount').optional().isFloat({ min: 0.01 }).withMessage('Valid amount required'),
  ],
  updateExpense as any
);

/**
 * @route   PATCH /api/expenses/:id/approve
 * @desc    Approve or reject expense
 * @access  Admin or Manager
 */
router.patch(
  '/:id/approve',
  requireAdminOrManager as any,
  [
    body('approval_status')
      .isIn(['APPROVED', 'REJECTED'])
      .withMessage('Invalid approval status'),
  ],
  approveExpense as any
);

/**
 * @route   DELETE /api/expenses/:id
 * @desc    Delete expense (only if not approved)
 * @access  Authenticated users (own) or Admin
 */
router.delete('/:id', deleteExpense as any);

export default router;
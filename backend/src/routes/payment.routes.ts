import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import { authenticate, authorize } from '../middleware/auth';
import { requireAdmin } from '../middleware/permissions';
import { body } from 'express-validator';
import { UserRole } from '../models/User';

const router = Router();

// Apply authentication to all routes
router.use(authenticate as any);

// Get all payments (accessible to all authenticated users)
router.get('/', paymentController.getAllPayments as any);

// Get payments for a specific order (accessible to all authenticated users)
router.get('/order/:orderId', paymentController.getPaymentsByOrder as any);

// Get payment by ID (accessible to all authenticated users)
router.get('/:id', paymentController.getPaymentById as any);

// Soft-cancel a payment (marks as cancelled, recalculates order) — ADMIN only
router.post(
  '/:id/cancel',
  authorize(UserRole.ADMIN) as any,
  [
    body('reason').optional().isString().isLength({ max: 500 }),
  ],
  paymentController.cancelPayment as any
);

// Permanently hard-delete a payment that has already been soft-cancelled — ADMIN only
router.delete(
  '/:id/permanent',
  authorize(UserRole.ADMIN) as any,
  paymentController.deletePaymentPermanently as any
);

// Get payment statistics (Admin only)
router.get('/statistics/summary', requireAdmin as any, paymentController.getPaymentStatistics as any);

// Get refund summary (Admin/Manager only)
router.get(
  '/refunds/summary',
  authorize(UserRole.ADMIN, UserRole.MANAGER) as any,
  paymentController.getRefundSummary as any
);

// Process refund for an order — ADMIN only, because a full refund cancels the
// order and cancellation is an administrator action. Managers raise a request.
router.post(
  '/refund/:orderId',
  authorize(UserRole.ADMIN) as any,
  [
    body('refund_amount').isFloat({ min: 0.01 }).withMessage('Refund amount must be greater than zero'),
    body('refund_reason').notEmpty().withMessage('Refund reason is required'),
    body('payment_method').optional().isString(),
    body('transaction_reference').optional().isString(),
    body('notes').optional().isString(),
  ],
  paymentController.processRefund as any
);

// Refund Approval Workflow Routes

// Get pending refund requests (Admin only)
router.get(
  '/refund-requests/pending',
  authorize(UserRole.ADMIN) as any,
  paymentController.getPendingRefundRequests as any
);

// Create refund request (All authenticated users - Desktop agents, Managers)
router.post(
  '/refund-requests/:orderId',
  [
    body('refund_amount').isFloat({ min: 0.01 }).withMessage('Refund amount must be greater than zero'),
    body('refund_reason').isLength({ min: 10 }).withMessage('Refund reason must be at least 10 characters'),
    body('payment_method').optional().isString(),
    body('transaction_reference').optional().isString(),
    body('notes').optional().isString(),
    body('cancel_order').optional().isBoolean()
  ],
  paymentController.createRefundRequest as any
);

// Approve refund request (Admin only)
router.post(
  '/refund-requests/:requestId/approve',
  authorize(UserRole.ADMIN) as any,
  paymentController.approveRefundRequest as any
);

// Reject refund request (Admin only)
router.post(
  '/refund-requests/:requestId/reject',
  authorize(UserRole.ADMIN) as any,
  [
    body('rejection_reason').isLength({ min: 10 }).withMessage('Rejection reason must be at least 10 characters')
  ],
  paymentController.rejectRefundRequest as any
);

// Export payments to CSV (Admin only)
router.get('/export/csv', requireAdmin as any, paymentController.exportPayments as any);

// Export payments to PDF (Admin only)
router.get('/export/pdf', requireAdmin as any, paymentController.exportPaymentsPDF as any);

export default router;

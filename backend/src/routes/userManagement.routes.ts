import express from 'express';
import { authenticate, requireAdmin, requireAdminOrManager } from '../middleware/auth';
import * as userManagementController from '../controllers/userManagement.controller';

const router = express.Router();

// All routes require authentication. Managers may manage Desktop Agents;
// role changes and deletions stay administrator-only.
router.use(authenticate as any, requireAdminOrManager as any);

router.get('/users', userManagementController.getAllUsers as any);
router.get('/users/pending', userManagementController.getPendingUsers as any);
router.get('/users/statistics', userManagementController.getUserStatistics as any);
router.get('/users/:userId/login-history', userManagementController.getUserLoginHistory as any);

router.put('/users/:userId/approve', userManagementController.approveUser as any);
router.put('/users/:userId/reject', userManagementController.rejectUser as any);
router.put('/users/:userId/suspend', userManagementController.suspendUser as any);
router.put('/users/:userId/activate', userManagementController.activateUser as any);
router.put('/users/:userId/role', requireAdmin as any, userManagementController.updateUserRole as any);
router.put('/users/:userId/branch', userManagementController.updateUserBranch as any);
router.delete('/users/:userId', requireAdmin as any, userManagementController.deleteUser as any);

// Activity logs routes
router.get('/activity-logs', userManagementController.getActivityLogs as any);

// Password reset request routes (admin only)
router.get('/password-reset-requests', userManagementController.getPasswordResetRequests as any);
router.get('/password-reset-requests/all', userManagementController.getAllPasswordResetRequests as any);
router.post('/users/:userId/reset-password', userManagementController.resetUserPassword as any);
router.delete('/password-reset-requests/:requestId', userManagementController.deletePasswordResetRequest as any);
router.patch('/password-reset-requests/:requestId/reactivate', userManagementController.reactivatePasswordResetRequest as any);

export default router;

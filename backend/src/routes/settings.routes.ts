import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller';
import { authenticate } from '../middleware/auth';
import { canAccessSettings } from '../middleware/permissions';

const router = Router();

// All routes require authentication
router.use(authenticate as any);

// Business info - accessible to all authenticated users (read-only for cashiers)
router.get('/business-info', settingsController.getBusinessInfo as any);

// Business hours - accessible to all authenticated users (read-only for cashiers)
router.get('/business-hours', settingsController.getBusinessHours as any);

// Get all settings - accessible to all authenticated users
router.get('/all', settingsController.getAllSettings as any);

// VAT settings
router.get('/vat', settingsController.getVATSettings as any);
router.put('/vat', canAccessSettings as any, settingsController.updateVATSettings as any);

// Bargain limits - Admin only
router.get('/bargain-limits', canAccessSettings as any, settingsController.getBargainLimits as any);
router.post('/bargain-limits', canAccessSettings as any, settingsController.updateBargainLimits as any);

// Payment accounts for on-account / partial WhatsApp receipts
router.get('/payment-accounts', settingsController.getPaymentAccounts as any);
router.put('/payment-accounts', canAccessSettings as any, settingsController.updatePaymentAccounts as any);

// Update requires admin
router.put('/business-info', canAccessSettings as any, settingsController.updateBusinessInfo as any);
router.put('/business-hours', canAccessSettings as any, settingsController.updateBusinessHours as any);

// Bulk update settings - requires admin
router.post('/bulk-update', canAccessSettings as any, settingsController.bulkUpdateSettings as any);

export default router;

import { Router } from 'express';
import * as reportController from '../controllers/report.controller';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();

// All routes require authentication
router.use(authenticate as any);

// Dashboard, revenue, customer analytics - Admin & Manager only
router.get('/dashboard', authorize(UserRole.ADMIN, UserRole.MANAGER) as any, reportController.getDashboardStats as any);
router.get('/revenue', authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.DESKTOP_AGENT) as any, reportController.getRevenueReport as any);
router.get('/customers', authorize(UserRole.ADMIN, UserRole.MANAGER) as any, reportController.getCustomerAnalytics as any);
router.get('/download/pdf', authorize(UserRole.ADMIN, UserRole.MANAGER) as any, reportController.downloadPDFReport as any);

// Staff performance - All roles (DESKTOP_AGENT sees only their own stats)
router.get('/staff-performance', authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.DESKTOP_AGENT) as any, reportController.getStaffPerformance as any);

// VAT summary - Admin & Manager only
router.get('/vat-summary', authorize(UserRole.ADMIN, UserRole.MANAGER) as any, reportController.getVATSummary as any);

export default router;

import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import customerRoutes from './customer.routes';
import priceRoutes from './price.routes';
import orderRoutes from './order.routes';
import reportRoutes from './report.routes';
import dashboardRoutes from './dashboard.routes';
import settingsRoutes from './settings.routes';
import newNotificationsRoutes from './notifications.routes'; // New notification system
import promotionsRoutes from './promotions.routes';
import inventoryRoutes from './inventory.routes';
import deliveriesRoutes from './deliveries.routes';
import backupRoutes from './backup.routes';
import userManagementRoutes from './userManagement.routes';
import announcementRoutes from './announcement.routes';
import expenseRoutes from './expense.routes';
import financialRoutes from './financial.routes';
import payrollRoutes from './payroll.routes';
import whatsappRoutes from './whatsapp.routes';
import paymentRoutes from './payment.routes';
import pendingPaymentRoutes from './pendingPayment.routes';
import notificationRoutes from './notification.routes';
import accountingRoutes from './accounting.routes';
import fiscalYearRoutes from './fiscalYear.routes';
import automationRoutes from './automation.routes';
import reminderRoutes from './reminder.routes';
import branchRoutes from './branch.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/customers', customerRoutes);
router.use('/prices', priceRoutes);
router.use('/orders', orderRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/settings', settingsRoutes);
router.use('/branches', branchRoutes);
router.use('/notifications', newNotificationsRoutes); // New notification system with announcements
router.use('/promotions', promotionsRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/deliveries', deliveriesRoutes);
router.use('/backup', backupRoutes);
router.use('/user-management', userManagementRoutes);
router.use('/announcements', announcementRoutes);
router.use('/expenses', expenseRoutes);
router.use('/financial', financialRoutes);
router.use('/payroll', payrollRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/payments', paymentRoutes);
router.use('/pending-payments', pendingPaymentRoutes);
// router.use('/notifications', notificationRoutes); // OLD - Disabled in favor of new system
router.use('/accounting', accountingRoutes);
router.use('/fiscal-years', fiscalYearRoutes);
router.use('/admin', userManagementRoutes); // Admin-only user management routes
router.use('/automation-settings', automationRoutes); // WhatsApp automation settings
router.use('/reminders', reminderRoutes); // Customer reminder system

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;

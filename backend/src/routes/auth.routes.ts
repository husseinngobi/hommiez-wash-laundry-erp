import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { authValidation as newAuthValidation } from '../middleware/validation.middleware';
import { loginLimiter } from '../middleware/security.middleware';
import { upload } from '../config/multer';

const router = Router();

// Public routes with validation
router.post('/register', newAuthValidation.register, authController.register as any);
router.post('/login', loginLimiter, newAuthValidation.login, authController.login as any);
router.post('/forgot-password', newAuthValidation.forgotPassword, authController.forgotPassword as any);

// Protected routes
router.get('/me', authenticate as any, authController.getMe as any);
router.put('/profile', authenticate as any, authController.updateProfile as any);
router.post('/profile-picture', authenticate as any, upload.single('profilePicture'), authController.uploadProfilePicture as any);
router.post('/session-timeout', authenticate as any, authController.updateSessionTimeout as any);
router.post('/change-password', authenticate as any, authController.changePassword as any);

export default router;

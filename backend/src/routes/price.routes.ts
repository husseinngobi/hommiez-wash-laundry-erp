import { Router } from 'express';
import * as priceController from '../controllers/price.controller';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';
import { priceValidation } from '../middleware/validation';

const router = Router();

// All routes require authentication
router.use(authenticate as any);

// Category management (must be before /:id to avoid conflicts)
router.get('/categories', priceController.getCategories as any);
router.put('/categories/:name', authorize(UserRole.ADMIN) as any, priceController.renameCategory as any);
router.delete('/categories/:name', authorize(UserRole.ADMIN) as any, priceController.deleteCategory as any);

// Read operations (all authenticated users)
router.get('/', priceController.getAllPrices as any);
router.get('/:id', priceController.getPriceById as any);

// Write operations (Admin only)
router.post('/', authorize(UserRole.ADMIN) as any, priceValidation.create, priceController.createPrice as any);
router.put('/:id', authorize(UserRole.ADMIN) as any, priceValidation.update, priceController.updatePrice as any);
router.delete('/:id', authorize(UserRole.ADMIN) as any, priceController.deletePrice as any);

export default router;

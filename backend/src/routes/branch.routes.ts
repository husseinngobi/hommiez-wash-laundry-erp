import { Router } from 'express';
import * as branchController from '../controllers/branch.controller';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();

router.use(authenticate as any);

// Any authenticated user needs to read branches (order forms, receipts, filters)
router.get('/', branchController.getBranches as any);

// Branch trading figures — managers and administrators
router.get(
  '/performance',
  authorize(UserRole.ADMIN, UserRole.MANAGER) as any,
  branchController.getBranchPerformance as any
);

// Only administrators manage the branch list
router.post('/', authorize(UserRole.ADMIN) as any, branchController.createBranch as any);
router.put('/:id', authorize(UserRole.ADMIN) as any, branchController.updateBranch as any);
router.delete('/:id', authorize(UserRole.ADMIN) as any, branchController.deleteBranch as any);

export default router;

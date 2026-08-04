import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/permissions';
import { getDamageClaims, createDamageClaim, updateDamageClaim } from '../controllers/damage.controller';

const router = express.Router();

router.use(authenticate as any);

// Anyone can log a claim; resolution requires admin
router.get('/', getDamageClaims as any);
router.post('/', createDamageClaim as any);
router.patch('/:id', requireAdmin as any, updateDamageClaim as any);

export default router;

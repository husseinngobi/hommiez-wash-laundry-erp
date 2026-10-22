import { NextFunction, Response } from 'express';
import { config } from '../config';
import { query } from '../config/database';
import type { AuthRequest } from './auth';
import { runWithTenantContext } from '../utils/tenantContext';

export const resolveTenantIdFromRequest = (req: AuthRequest): number => {
  void req;
  return config.tenancy.deploymentTenantId;
};

export const tenantContextMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const tenantId = resolveTenantIdFromRequest(req);

  req.tenant = {
    id: tenantId,
  };

  runWithTenantContext(tenantId, async () => {
    try {
      const tenant = await query(
        'SELECT id FROM tenants WHERE id = $1 AND is_active = TRUE',
        [tenantId]
      );
      if (tenant.rows.length === 0) {
        return res.status(403).json({ error: 'Tenant is unavailable' });
      }
      next();
    } catch (error) {
      next(error);
    }
  });
};

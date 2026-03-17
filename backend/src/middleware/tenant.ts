import { NextFunction, Response } from 'express';
import { config } from '../config';
import { AuthRequest } from './auth';
import { runWithTenantContext } from '../utils/tenantContext';

const parsePositiveInt = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

export const resolveTenantIdFromRequest = (req: AuthRequest): number => {
  const defaultTenantId = config.tenancy.defaultTenantId;

  if (!config.tenancy.allowRequestOverride) {
    return defaultTenantId;
  }

  const headerTenantId = parsePositiveInt(req.headers['x-tenant-id']);
  if (headerTenantId) return headerTenantId;

  const queryTenantId = parsePositiveInt(req.query?.tenant_id);
  if (queryTenantId) return queryTenantId;

  const bodyTenantId = parsePositiveInt((req.body as Record<string, unknown> | undefined)?.tenant_id);
  if (bodyTenantId) return bodyTenantId;

  return defaultTenantId;
};

export const tenantContextMiddleware = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const tenantId = resolveTenantIdFromRequest(req);

  req.tenant = {
    id: tenantId,
  };

  runWithTenantContext(tenantId, () => next());
};

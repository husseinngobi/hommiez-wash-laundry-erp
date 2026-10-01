import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';

export function canChooseBranch(role?: string): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

/** True when a desktop agent (or other non-admin) must not see this branch’s row. */
export function isOutsideStaffBranch(req: AuthRequest, recordBranchId: unknown): boolean {
  if (canChooseBranch(req.user?.role)) return false;
  const mine = Number(req.user?.branch_id);
  if (!Number.isFinite(mine) || mine <= 0) return true;
  const theirs = Number(recordBranchId);
  if (!Number.isFinite(theirs) || theirs <= 0) return true;
  return theirs !== mine;
}

export function forbiddenIfOutsideBranch(
  req: AuthRequest,
  res: Response,
  recordBranchId: unknown
): boolean {
  if (!isOutsideStaffBranch(req, recordBranchId)) return false;
  res.status(403).json({ error: 'You can only access records for your assigned branch' });
  return true;
}

/** Branch to write against: admins/managers may pick; staff are locked to their own. */
export function resolveWriteBranchId(req: AuthRequest, requested?: unknown): number | null {
  if (canChooseBranch(req.user?.role) && requested != null && requested !== '' && requested !== 'all') {
    const n = Number(requested);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return req.user?.branch_id ?? null;
}

/**
 * Branch to list/filter against.
 * Admins/managers: omit or "all" → every branch; otherwise the selected one.
 * Desktop agents: always their assigned branch.
 */
export function resolveListBranchId(req: AuthRequest, requested?: unknown): number | null {
  if (canChooseBranch(req.user?.role)) {
    if (requested != null && requested !== '' && requested !== 'all') {
      const n = Number(requested);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }
  const bid = Number(req.user?.branch_id);
  if (Number.isFinite(bid) && bid > 0) return bid;
  // Unassigned staff must not fall through to company-wide lists.
  return -1;
}

/** Append AND col = id to a WHERE clause, or start WHERE if empty. */
export function andBranchFilter(existingWhere: string, column: string, branchId: number | null): string {
  if (!branchId) return existingWhere;
  const clause = `${column} = ${Number(branchId)}`;
  if (!existingWhere || !existingWhere.trim()) return `WHERE ${clause}`;
  return `${existingWhere} AND ${clause}`;
}

export function paymentsFrom(branchId: number | null): string {
  if (!branchId) return 'FROM payments p';
  return `FROM payments p INNER JOIN orders o ON o.id = p.order_id AND o.branch_id = ${Number(branchId)}`;
}

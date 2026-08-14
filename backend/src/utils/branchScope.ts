import { AuthRequest } from '../middleware/auth';

export function canChooseBranch(role?: string): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
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
  return req.user?.branch_id ?? null;
}

/** Append AND col = id to a WHERE clause, or start WHERE if empty. */
export function andBranchFilter(existingWhere: string, column: string, branchId: number | null): string {
  if (!branchId) return existingWhere;
  const clause = `${column} = ${Number(branchId)}`;
  if (!existingWhere || !existingWhere.trim()) return `WHERE ${clause}`;
  return `${existingWhere} AND ${clause}`;
}

export function paymentsFrom(branchId: number | null): string {
  if (!branchId) return 'FROM payments';
  return `FROM payments p INNER JOIN orders o ON o.id = p.order_id AND o.branch_id = ${Number(branchId)}`;
}

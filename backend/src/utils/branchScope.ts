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

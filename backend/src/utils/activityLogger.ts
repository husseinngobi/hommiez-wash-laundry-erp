import { query } from '../config/database';

export type LogSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface LogActivityParams {
  userId?: number;
  userEmail?: string;
  userName?: string;
  userRole?: string;
  action: string;
  resourceType?: string;
  resourceId?: number;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  severity?: LogSeverity;
}

/**
 * Comprehensive activity logging function with security tracking
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await query(
      `INSERT INTO activity_logs (
        user_id, user_email, user_name, user_role,
        action, resource_type, resource_id, details,
        ip_address, user_agent, severity, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        params.userId || null,
        params.userEmail || null,
        params.userName || null,
        params.userRole || null,
        params.action,
        params.resourceType || null,
        params.resourceId || null,
        params.details ? JSON.stringify(params.details) : null,
        params.ipAddress || null,
        params.userAgent || null,
        params.severity || 'INFO'
      ]
    );
  } catch (error) {
    console.error('Failed to log activity:', error);
    // Don't throw error - logging failure shouldn't break the application
  }
}

/**
 * Log failed login attempts (SECURITY)
 */
export async function logFailedLogin(
  email: string, 
  ipAddress: string, 
  userAgent?: string,
  reason?: string
): Promise<void> {
  await logActivity({
    userEmail: email,
    action: 'LOGIN_FAILED',
    details: { reason: reason || 'Invalid credentials' },
    ipAddress,
    userAgent,
    severity: 'WARNING'
  });
}

/**
 * Log successful login (AUTH)
 */
export async function logSuccessfulLogin(
  userId: number,
  email: string,
  name: string,
  role: string,
  ipAddress: string,
  userAgent?: string
): Promise<void> {
  await logActivity({
    userId,
    userEmail: email,
    userName: name,
    userRole: role,
    action: 'LOGIN_SUCCESS',
    ipAddress,
    userAgent,
    severity: 'INFO'
  });
}

/**
 * Log account lockout (SECURITY)
 */
export async function logAccountLocked(
  userId: number,
  email: string,
  ipAddress: string,
  attempts: number
): Promise<void> {
  await logActivity({
    userId,
    userEmail: email,
    action: 'ACCOUNT_LOCKED',
    details: { 
      reason: 'Too many failed login attempts',
      attempts,
      locked_until: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
    },
    ipAddress,
    severity: 'CRITICAL'
  });
}

/**
 * Log CRUD operations
 */
export async function logCreate(
  userId: number,
  userEmail: string,
  userName: string,
  userRole: string,
  resourceType: string,
  resourceId: number,
  details?: any,
  ipAddress?: string
): Promise<void> {
  await logActivity({
    userId,
    userEmail,
    userName,
    userRole,
    action: `CREATE_${resourceType.toUpperCase()}`,
    resourceType,
    resourceId,
    details,
    ipAddress,
    severity: 'INFO'
  });
}

export async function logUpdate(
  userId: number,
  userEmail: string,
  userName: string,
  userRole: string,
  resourceType: string,
  resourceId: number,
  details?: any,
  ipAddress?: string
): Promise<void> {
  await logActivity({
    userId,
    userEmail,
    userName,
    userRole,
    action: `UPDATE_${resourceType.toUpperCase()}`,
    resourceType,
    resourceId,
    details,
    ipAddress,
    severity: 'INFO'
  });
}

export async function logDelete(
  userId: number,
  userEmail: string,
  userName: string,
  userRole: string,
  resourceType: string,
  resourceId: number,
  details?: any,
  ipAddress?: string
): Promise<void> {
  await logActivity({
    userId,
    userEmail,
    userName,
    userRole,
    action: `DELETE_${resourceType.toUpperCase()}`,
    resourceType,
    resourceId,
    details,
    ipAddress,
    severity: 'WARNING'
  });
}

/**
 * Log suspicious activity (SECURITY)
 */
export async function logSuspiciousActivity(
  description: string,
  ipAddress: string,
  userAgent?: string,
  details?: any
): Promise<void> {
  await logActivity({
    action: 'SUSPICIOUS_ACTIVITY',
    details: { description, ...details },
    ipAddress,
    userAgent,
    severity: 'ERROR'
  });
}

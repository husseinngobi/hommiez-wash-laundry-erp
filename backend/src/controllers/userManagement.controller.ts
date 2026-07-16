import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { UserRole, UserStatus } from '../models/User';
import bcrypt from 'bcryptjs';
import { userNotificationService } from '../services/user-notification.service';
import { getSystemAdminEmails, isSystemAdminEmail } from '../utils/systemAdmin';

const getHiddenSystemAdminEmails = (req: AuthRequest): string[] => {
  if (req.user?.is_system_admin) {
    return [];
  }
  return getSystemAdminEmails();
};

const enforceTargetVisibility = (req: AuthRequest, targetEmail?: string) => {
  if (!targetEmail) return null;
  if (req.user?.is_system_admin) return null;

  if (isSystemAdminEmail(targetEmail)) {
    return {
      status: 403,
      payload: { error: 'Access denied for this account' },
    };
  }

  return null;
};

const tableHasColumn = async (tableName: string, columnName: string): Promise<boolean> => {
  const result = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2
     ) AS exists`,
    [tableName, columnName]
  );
  return result.rows[0]?.exists === true;
};

// Get all users (Admin only)
export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { status, role, search, page, limit } = req.query;
    const hiddenSystemAdminEmails = getHiddenSystemAdminEmails(req);
    const hasDeletedAt = await tableHasColumn('users', 'deleted_at');
    
    // Pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;
    const offset = (pageNum - 1) * limitNum;
    
    let queryText = `
      SELECT 
        u.id, u.email, u.full_name, u.phone, u.role, u.status, 
        u.created_at, u.updated_at, u.last_login, u.profile_picture, u.profile_picture_url,
        c.full_name as created_by_name
      FROM users u
      LEFT JOIN users c ON u.created_by = c.id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;
    
    if (status) {
      queryText += ` AND u.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    if (role) {
      queryText += ` AND u.role = $${paramCount}`;
      params.push(role);
      paramCount++;
    }
    
    if (search) {
      queryText += ` AND (u.full_name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (hasDeletedAt) {
      queryText += ' AND u.deleted_at IS NULL';
    }

    if (hiddenSystemAdminEmails.length > 0) {
      queryText += ` AND (u.email IS NULL OR LOWER(u.email) != ALL($${paramCount}::text[]))`;
      params.push(hiddenSystemAdminEmails);
      paramCount++;
    }
    
    // Get total count
    const countQuery = queryText.replace(
      'SELECT \n        u.id, u.email, u.full_name, u.phone, u.role, u.status, \n        u.created_at, u.updated_at, u.last_login, u.profile_picture, u.profile_picture_url,\n        c.full_name as created_by_name\n      FROM users u',
      'SELECT COUNT(*) FROM users u'
    );
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Add pagination
    queryText += ` ORDER BY u.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limitNum, offset);
    
    const result = await query(queryText, params);
    
    res.json({
      success: true,
      users: result.rows,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Get inactive users (Admin only)
export const getPendingUsers = async (req: AuthRequest, res: Response) => {
  try {
    const hiddenSystemAdminEmails = getHiddenSystemAdminEmails(req);
    const hasDeletedAt = await tableHasColumn('users', 'deleted_at');
    let queryText = `SELECT 
        u.id, u.email, u.full_name, u.phone, u.role, u.status, u.created_at,
        c.full_name as created_by_name
       FROM users u
       LEFT JOIN users c ON u.created_by = c.id
       WHERE u.status = $1`;
    const params: any[] = [UserStatus.PENDING];

    if (hasDeletedAt) {
      queryText += ' AND u.deleted_at IS NULL';
    }

    if (hiddenSystemAdminEmails.length > 0) {
      queryText += ` AND (u.email IS NULL OR LOWER(u.email) != ALL($2::text[]))`;
      params.push(hiddenSystemAdminEmails);
    }

    queryText += ' ORDER BY u.created_at ASC';

    const result = await query(queryText, params);
    
    res.json({
      success: true,
      users: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get pending users error:', error);
    res.status(500).json({ error: 'Failed to fetch pending users' });
  }
};

// Approve user (Admin only)
export const approveUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const adminId = req.user?.id;
    
    // Check if user exists and is pending
    const userCheck = await query(
      'SELECT id, email, full_name, status, role FROM users WHERE id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userCheck.rows[0];

    const visibilityBlock = enforceTargetVisibility(req, user.email);
    if (visibilityBlock) {
      return res.status(visibilityBlock.status).json(visibilityBlock.payload);
    }
    
    if (user.status !== UserStatus.PENDING) {
      return res.status(400).json({ error: 'User is not awaiting approval' });
    }

    // Approve user only. Keep role selected during registration.
    const result = await query(
      `UPDATE users 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, full_name, role, status`,
      [UserStatus.ACTIVE, userId]
    );

    const approvedUser = result.rows[0];

    // Send approval notification email to user
    userNotificationService.notifyUserApproved({
      email: approvedUser.email,
      full_name: approvedUser.full_name,
      role: approvedUser.role,
    }).catch(err => {
      console.error('Failed to send approval notification:', err);
      // Don't fail approval if email fails
    });
    
    // Log activity without blocking approval response on logging schema drift/issues.
    try {
      await query(
        `INSERT INTO activity_logs (user_id, user_email, user_name, user_role, action, resource_type, resource_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          adminId,
          req.user?.email,
          req.user?.full_name,
          req.user?.role,
          'APPROVE_USER',
          'USER',
          userId,
          JSON.stringify({ approved_user: user.full_name, approved_user_email: user.email }),
          req.ip || 'unknown'
        ]
      );
    } catch (logError) {
      console.error('Approve user activity log insert failed:', logError);
    }
    
    res.json({
      success: true,
      message: 'User approved successfully',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ error: 'Failed to approve user' });
  }
};

// Reject user (Admin only)
export const rejectUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const adminId = req.user?.id;
    
    // Check if user exists and is pending
    const userCheck = await query(
      'SELECT id, email, full_name, status, role FROM users WHERE id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userCheck.rows[0];

    const visibilityBlock = enforceTargetVisibility(req, user.email);
    if (visibilityBlock) {
      return res.status(visibilityBlock.status).json(visibilityBlock.payload);
    }
    
    if (user.status !== UserStatus.PENDING) {
      return res.status(400).json({ error: 'User is not awaiting approval' });
    }
    
    // Reject the user by setting status to REJECTED
    await query(
      `UPDATE users 
       SET status = $1, rejection_reason = $2, updated_at = NOW()
       WHERE id = $3`,
      [UserStatus.REJECTED, reason, userId]
    );

    // Send rejection notification email to user
    userNotificationService.notifyUserRejected({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      rejection_reason: reason,
    }).catch(err => {
      console.error('Failed to send rejection notification:', err);
      // Don't fail rejection if email fails
    });
    
    // Log activity without blocking rejection response on logging schema drift/issues.
    try {
      await query(
        `INSERT INTO activity_logs (user_id, user_email, user_name, user_role, action, resource_type, resource_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          adminId,
          req.user?.email,
          req.user?.full_name,
          req.user?.role,
          'REJECT_USER',
          'USER',
          userId,
          JSON.stringify({ rejected_user: user.full_name, rejected_user_email: user.email, reason }),
          req.ip || 'unknown'
        ]
      );
    } catch (logError) {
      console.error('Reject user activity log insert failed:', logError);
    }
    
    res.json({
      success: true,
      message: 'User rejected successfully',
      user: { id: userId, email: user.email, full_name: user.full_name },
    });
  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({ error: 'Failed to reject user' });
  }
};

// Suspend user (Admin only)
export const suspendUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const adminId = req.user?.id;
    
    // Check if user exists
    const userCheck = await query(
      'SELECT id, email, full_name, status, role FROM users WHERE id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userCheck.rows[0];

    const visibilityBlock = enforceTargetVisibility(req, user.email);
    if (visibilityBlock) {
      return res.status(visibilityBlock.status).json(visibilityBlock.payload);
    }
    
    // Prevent suspending admins
    if (user.role === UserRole.ADMIN) {
      return res.status(403).json({ error: 'Cannot suspend administrator accounts' });
    }
    
    // Prevent self-suspension
    if (user.id === adminId) {
      return res.status(403).json({ error: 'Cannot suspend your own account' });
    }
    
    // Suspend user
    const result = await query(
      `UPDATE users 
       SET status = $1, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, email, full_name, role, status, rejection_reason`,
      [UserStatus.SUSPENDED, reason || 'Account suspended by administrator', userId]
    );
    
    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, user_email, user_name, user_role, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        adminId,
        req.user?.email,
        req.user?.full_name,
        req.user?.role,
        'SUSPEND_USER',
        'USER',
        userId,
        JSON.stringify({ suspended_user: user.full_name, suspended_user_email: user.email, reason }),
        req.ip || 'unknown'
      ]
    );
    
    res.json({
      success: true,
      message: 'User suspended successfully',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Suspend user error:', error);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
};

// Activate user (Admin only) - Generates temporary password for reactivation
export const activateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const adminId = req.user?.id;
    
    // Check if user exists
    const userCheck = await query(
      'SELECT id, email, full_name, status FROM users WHERE id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userCheck.rows[0];

    const visibilityBlock = enforceTargetVisibility(req, user.email);
    if (visibilityBlock) {
      return res.status(visibilityBlock.status).json(visibilityBlock.payload);
    }
    
    if (user.status === UserStatus.ACTIVE) {
      return res.status(400).json({ error: 'User is already active' });
    }
    
    // Generate temporary password (8 characters: letters + numbers)
    const generateTempPassword = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      let password = '';
      for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };
    
    const temporaryPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    
    // Activate user and set temporary password with must_change_password flag
    const result = await query(
      `UPDATE users 
       SET status = $1, 
           password = $2,
           must_change_password = TRUE,
           rejection_reason = NULL, 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, email, full_name, role, status`,
      [UserStatus.ACTIVE, hashedPassword, userId]
    );
    
    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, user_email, user_name, user_role, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        adminId,
        req.user?.email,
        req.user?.full_name,
        req.user?.role,
        'ACTIVATE_USER',
        'USER',
        userId,
        JSON.stringify({ 
          activated_user: user.full_name, 
          activated_user_email: user.email,
          temporary_password_generated: true 
        }),
        req.ip || 'unknown'
      ]
    );
    
    res.json({
      success: true,
      message: 'User activated successfully',
      temporaryPassword: temporaryPassword, // Send to admin to give to user
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Activate user error:', error);
    res.status(500).json({ error: 'Failed to activate user' });
  }
};

// Update user role (Admin only)
export const updateUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const adminId = req.user?.id;
    
    // Validate role
    if (!Object.values(UserRole).includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    // Check if user exists
    const userCheck = await query(
      'SELECT id, email, full_name, role FROM users WHERE id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userCheck.rows[0];
    const oldRole = user.role;

    const visibilityBlock = enforceTargetVisibility(req, user.email);
    if (visibilityBlock) {
      return res.status(visibilityBlock.status).json(visibilityBlock.payload);
    }
    
    // Prevent self-demotion from admin
    if (user.id === adminId && role !== UserRole.ADMIN) {
      return res.status(403).json({ error: 'Cannot change your own admin role' });
    }
    
    // Update role
    const result = await query(
      `UPDATE users 
       SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, full_name, role, status`,
      [role, userId]
    );
    
    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, user_email, user_name, user_role, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        adminId,
        req.user?.email,
        req.user?.full_name,
        req.user?.role,
        'UPDATE_USER_ROLE',
        'USER',
        userId,
        JSON.stringify({ 
          target_user: user.full_name, 
          target_user_email: user.email, 
          old_role: oldRole, 
          new_role: role 
        }),
        req.ip || 'unknown'
      ]
    );
    
    res.json({
      success: true,
      message: 'User role updated successfully',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
};

// Delete user (Admin only)
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const adminId = req.user?.id;
    
    // Check if user exists
    const userCheck = await query(
      'SELECT id, email, full_name, role FROM users WHERE id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userCheck.rows[0];

    const visibilityBlock = enforceTargetVisibility(req, user.email);
    if (visibilityBlock) {
      return res.status(visibilityBlock.status).json(visibilityBlock.payload);
    }
    
    // Prevent deleting admins
    if (user.role === UserRole.ADMIN) {
      return res.status(403).json({ error: 'Cannot delete administrator accounts' });
    }
    
    // Prevent self-deletion
    if (user.id === adminId) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }
    
    const expenseUserColumns: string[] = [];
    if (await tableHasColumn('expenses', 'submitted_by')) expenseUserColumns.push('submitted_by');
    if (await tableHasColumn('expenses', 'approved_by')) expenseUserColumns.push('approved_by');
    if (await tableHasColumn('expenses', 'rejected_by')) expenseUserColumns.push('rejected_by');

    const expenseCountPromise = expenseUserColumns.length > 0
      ? query(
          `SELECT COUNT(*) as count FROM expenses WHERE ${expenseUserColumns.map(col => `${col} = $1`).join(' OR ')}`,
          [userId]
        )
      : Promise.resolve({ rows: [{ count: '0' }] } as any);

    // Check if user has any related activity that prevents deletion
    const activityChecks = await Promise.all([
      query('SELECT COUNT(*) as count FROM orders WHERE user_id = $1', [userId]),
      query('SELECT COUNT(*) as count FROM orders WHERE user_id = $1 AND payment_status IN (\'PENDING\', \'PARTIAL\')', [userId]),
      query('SELECT COUNT(*) as count FROM payments WHERE created_by = $1', [userId]),
      expenseCountPromise,
    ]);
    
    const totalOrderCount = parseInt(activityChecks[0].rows[0].count);
    const pendingOrderCount = parseInt(activityChecks[1].rows[0].count);
    const paymentCount = parseInt(activityChecks[2].rows[0].count);
    const expenseCount = parseInt(activityChecks[3].rows[0].count);
    
    // Build detailed error message if user has activity
    if (totalOrderCount > 0 || paymentCount > 0 || expenseCount > 0) {
      const activities = [];
      if (totalOrderCount > 0) {
        if (pendingOrderCount > 0) {
          activities.push(`${pendingOrderCount} pending/partial order${pendingOrderCount > 1 ? 's' : ''}`);
        } else {
          activities.push(`${totalOrderCount} order${totalOrderCount > 1 ? 's' : ''}`);
        }
      }
      if (paymentCount > 0) activities.push(`${paymentCount} payment${paymentCount > 1 ? 's' : ''}`);
      if (expenseCount > 0) activities.push(`${expenseCount} expense${expenseCount > 1 ? 's' : ''}`);
      
      return res.status(400).json({ 
        error: `Cannot delete user: This user is linked to ${activities.join(', ')}. To maintain audit trail integrity, please suspend the account instead.`,
        details: {
          total_orders: totalOrderCount,
          pending_orders: pendingOrderCount,
          payments: paymentCount,
          expenses: expenseCount,
          suggestion: 'Use the Suspend action to deactivate this account while preserving historical records.'
        }
      });
    }
    
    // Remove related password reset requests to avoid FK conflicts on hard delete fallback.
    await query('DELETE FROM password_reset_requests WHERE user_id = $1', [userId]);

    const hasDeletedAt = await tableHasColumn('users', 'deleted_at');
    const hasDeletedBy = await tableHasColumn('users', 'deleted_by');

    if (hasDeletedAt && hasDeletedBy) {
      await query(
        `UPDATE users 
         SET deleted_at = NOW(), deleted_by = $1, updated_at = NOW()
         WHERE id = $2`,
        [adminId, userId]
      );
    } else if (hasDeletedAt) {
      await query(
        `UPDATE users 
         SET deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [userId]
      );
    } else {
      // Legacy schema fallback: hard delete only when there is no financial/activity linkage.
      await query('DELETE FROM users WHERE id = $1', [userId]);
    }
    
    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, user_email, user_name, user_role, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        adminId,
        req.user?.email,
        req.user?.full_name,
        req.user?.role,
        'DELETE_USER',
        'USER',
        userId,
        JSON.stringify({ deleted_user: user.full_name, deleted_user_email: user.email }),
        req.ip || 'unknown'
      ]
    );
    
    res.json({
      success: true,
      message: 'User deleted successfully (soft delete - data preserved)',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// Get activity logs
export const getActivityLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, action, resourceType, limit = '100', offset = '0' } = req.query;
    const hiddenSystemAdminEmails = getHiddenSystemAdminEmails(req);
    
    let queryText = `
      SELECT 
        al.id, al.user_id, al.user_email, al.user_name, al.user_role,
        al.action, al.resource_type, al.resource_id, al.details,
        al.ip_address, al.created_at
      FROM activity_logs al
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;
    
    if (userId) {
      queryText += ` AND al.user_id = $${paramCount}`;
      params.push(userId);
      paramCount++;
    }
    
    if (action) {
      queryText += ` AND al.action = $${paramCount}`;
      params.push(action);
      paramCount++;
    }
    
    if (resourceType) {
      queryText += ` AND al.resource_type = $${paramCount}`;
      params.push(resourceType);
      paramCount++;
    }

    if (hiddenSystemAdminEmails.length > 0) {
      queryText += ` AND (al.user_email IS NULL OR LOWER(al.user_email) != ALL($${paramCount}::text[]))`;
      params.push(hiddenSystemAdminEmails);
      paramCount++;
    }
    
    queryText += ` ORDER BY al.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const result = await query(queryText, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM activity_logs WHERE 1=1';
    const countParams: any[] = [];
    let countParamNum = 1;
    
    if (userId) {
      countQuery += ` AND user_id = $${countParamNum}`;
      countParams.push(userId);
      countParamNum++;
    }
    if (action) {
      countQuery += ` AND action = $${countParamNum}`;
      countParams.push(action);
      countParamNum++;
    }
    if (resourceType) {
      countQuery += ` AND resource_type = $${countParamNum}`;
      countParams.push(resourceType);
      countParamNum++;
    }

    if (hiddenSystemAdminEmails.length > 0) {
      countQuery += ` AND (user_email IS NULL OR LOWER(user_email) != ALL($${countParamNum}::text[]))`;
      countParams.push(hiddenSystemAdminEmails);
    }
    
    const countResult = await query(countQuery, countParams);
    
    res.json({
      success: true,
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
};

// Get user statistics
export const getUserStatistics = async (req: AuthRequest, res: Response) => {
  try {
    const hiddenSystemAdminEmails = getHiddenSystemAdminEmails(req);
    const hasDeletedAt = await tableHasColumn('users', 'deleted_at');
    const statsQuery = hiddenSystemAdminEmails.length > 0
      ? `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_users,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending_users,
        COUNT(*) FILTER (WHERE status = 'SUSPENDED') as suspended_users,
        COUNT(*) FILTER (WHERE role = 'ADMIN') as admin_count,
        COUNT(*) FILTER (WHERE role = 'MANAGER') as manager_count,
        COUNT(*) FILTER (WHERE role = 'DESKTOP_AGENT') as desktop_agent_count,
        COUNT(*) as total_users
      FROM users
      WHERE email IS NULL OR LOWER(email) != ALL($1::text[])
      ${hasDeletedAt ? 'AND deleted_at IS NULL' : ''}
    `
      : `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_users,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending_users,
        COUNT(*) FILTER (WHERE status = 'SUSPENDED') as suspended_users,
        COUNT(*) FILTER (WHERE role = 'ADMIN') as admin_count,
        COUNT(*) FILTER (WHERE role = 'MANAGER') as manager_count,
        COUNT(*) FILTER (WHERE role = 'DESKTOP_AGENT') as desktop_agent_count,
        COUNT(*) as total_users
      FROM users
      ${hasDeletedAt ? 'WHERE deleted_at IS NULL' : ''}
    `;

    const stats = await query(
      statsQuery,
      hiddenSystemAdminEmails.length > 0 ? [hiddenSystemAdminEmails] : []
    );
    
    const recentActivity = await query(`
      SELECT action, COUNT(*) as count
      FROM activity_logs
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      statistics: stats.rows[0],
      recent_actions: recentActivity.rows,
    });
  } catch (error) {
    console.error('Get user statistics error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

// Get all password reset requests (Admin only)
export const getPasswordResetRequests = async (req: AuthRequest, res: Response) => {
  try {
    const hiddenSystemAdminEmails = getHiddenSystemAdminEmails(req);
    const result = await query(`
      SELECT 
        pr.id, pr.user_id, pr.requested_at, pr.status,
        u.email, u.full_name, u.role
      FROM password_reset_requests pr
      JOIN users u ON pr.user_id = u.id
      WHERE pr.status = 'PENDING'
        AND ($1::text[] = '{}'::text[] OR u.email IS NULL OR LOWER(u.email) != ALL($1::text[]))
      ORDER BY pr.requested_at DESC
    `, [hiddenSystemAdminEmails]);
    
    res.json({ 
      success: true,
      requests: result.rows 
    });
  } catch (error) {
    console.error('Get password reset requests error:', error);
    res.status(500).json({ error: 'Failed to fetch password reset requests' });
  }
};

// Get all password reset requests (PENDING, DENIED, COMPLETED)
export const getAllPasswordResetRequests = async (req: AuthRequest, res: Response) => {
  try {
    const hiddenSystemAdminEmails = getHiddenSystemAdminEmails(req);
    const result = await query(`
      SELECT 
        pr.id, pr.user_id, pr.requested_at, pr.status, pr.resolved_at, pr.resolved_by,
        u.email, u.full_name, u.role,
        admin.full_name as resolved_by_name
      FROM password_reset_requests pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN users admin ON pr.resolved_by = admin.id
      WHERE ($1::text[] = '{}'::text[] OR u.email IS NULL OR LOWER(u.email) != ALL($1::text[]))
      ORDER BY 
        CASE pr.status 
          WHEN 'PENDING' THEN 1
          WHEN 'DENIED' THEN 2
          WHEN 'COMPLETED' THEN 3
        END,
        pr.requested_at DESC
    `, [hiddenSystemAdminEmails]);
    
    res.json({ 
      success: true,
      requests: result.rows 
    });
  } catch (error) {
    console.error('Get all password reset requests error:', error);
    res.status(500).json({ error: 'Failed to fetch password reset requests' });
  }
};

// Reset user password (Admin approves request and sets temporary password)
export const resetUserPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { temporaryPassword } = req.body;
    const adminId = req.user!.id;

    const targetUserResult = await query('SELECT email FROM users WHERE id = $1', [userId]);
    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const visibilityBlock = enforceTargetVisibility(req, targetUserResult.rows[0].email);
    if (visibilityBlock) {
      return res.status(visibilityBlock.status).json(visibilityBlock.payload);
    }
    
    if (!temporaryPassword || temporaryPassword.length < 6) {
      return res.status(400).json({ error: 'Temporary password must be at least 6 characters' });
    }
    
    // Hash the temporary password
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    
    // Update user password and set must_change_password flag
    await query(
      `UPDATE users 
       SET password = $1, must_change_password = TRUE, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [hashedPassword, userId]
    );
    
    // Mark any pending password reset requests as completed
    await query(
      `UPDATE password_reset_requests 
       SET status = 'COMPLETED', resolved_at = CURRENT_TIMESTAMP, resolved_by = $1 
       WHERE user_id = $2 AND status = 'PENDING'`,
      [adminId, userId]
    );
    
    // Log the action (optional - removed created_by column that doesn't exist)
    try {
      await query(
        `INSERT INTO activity_logs (user_id, action, details)
         VALUES ($1, $2, $3)`,
        [
          userId, 
          'password_reset_by_admin', 
          JSON.stringify({ reset_by: adminId, admin_id: adminId, timestamp: new Date() })
        ]
      );
    } catch (logError) {
      // Activity log is optional, don't fail password reset if it fails
      console.warn('Failed to log activity (non-critical):', logError);
    }
    
    console.log(`✅ Admin ${adminId} reset password for user ${userId}`);
    
    res.json({ 
      success: true,
      message: 'Temporary password set successfully. User must change password on next login.',
      temporary_password: temporaryPassword
    });
  } catch (error) {
    console.error('Reset user password error:', error);
    res.status(500).json({ error: 'Failed to reset user password' });
  }
};

// Delete/deny password reset request
export const deletePasswordResetRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.params;
    const adminId = req.user!.id;
    
    // Mark request as denied instead of deleting
    await query(
      `UPDATE password_reset_requests 
       SET status = 'DENIED', resolved_at = CURRENT_TIMESTAMP, resolved_by = $1 
       WHERE id = $2`,
      [adminId, requestId]
    );
    
    console.log(`✅ Admin ${adminId} denied password reset request ${requestId}`);
    
    res.json({ 
      success: true,
      message: 'Password reset request denied' 
    });
  } catch (error) {
    console.error('Delete password reset request error:', error);
    res.status(500).json({ error: 'Failed to delete password reset request' });
  }
};

// Reactivate a denied password reset request
export const reactivatePasswordResetRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.params;
    
    // Set status back to PENDING and clear resolved fields
    await query(
      `UPDATE password_reset_requests 
       SET status = 'PENDING', resolved_at = NULL, resolved_by = NULL 
       WHERE id = $1`,
      [requestId]
    );
    
    console.log(`✅ Password reset request ${requestId} reactivated to PENDING`);
    
    res.json({ 
      success: true,
      message: 'Password reset request reactivated' 
    });
  } catch (error) {
    console.error('Reactivate password reset request error:', error);
    res.status(500).json({ error: 'Failed to reactivate password reset request' });
  }
};

// Get user login history
export const getUserLoginHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { start_date, end_date } = req.query;

    const targetUserResult = await query('SELECT email FROM users WHERE id = $1', [userId]);
    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const visibilityBlock = enforceTargetVisibility(req, targetUserResult.rows[0].email);
    if (visibilityBlock) {
      return res.status(visibilityBlock.status).json(visibilityBlock.payload);
    }
    
    let queryText = `
      SELECT id, user_id, action, ip_address, user_agent, created_at, details
      FROM activity_logs
      WHERE user_id = $1 AND action IN ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT')
    `;
    
    const params: any[] = [userId];
    let paramCount = 2;
    
    if (start_date) {
      queryText += ` AND created_at >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      queryText += ` AND created_at <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }
    
    queryText += ' ORDER BY created_at DESC LIMIT 100';
    
    const result = await query(queryText, params);
    
    res.json({
      success: true,
      history: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Get user login history error:', error);
    res.status(500).json({ error: 'Failed to fetch login history' });
  }
};

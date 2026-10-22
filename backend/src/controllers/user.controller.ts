import { Response } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { UserRole, UserStatus } from '../models/User';

export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status,
              u.branch_id, b.name AS branch_name, u.created_at, u.updated_at
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       ORDER BY u.created_at DESC`
    );
    
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status,
              u.branch_id, b.name AS branch_name, u.created_at, u.updated_at
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { id } = req.params;
    const { email, full_name, phone, branch_id } = req.body;
    
    // Only admins can update other users; users can update themselves
    if (req.user!.role !== UserRole.ADMIN && req.user!.id !== parseInt(id)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (email) {
      if (req.user!.role !== UserRole.ADMIN) {
        return res.status(403).json({
          error: 'Only an administrator can change a login email',
        });
      }
      updates.push(`email = $${paramCount++}`);
      values.push(String(email).trim().toLowerCase());
    }
    if (full_name) {
      updates.push(`full_name = $${paramCount++}`);
      values.push(full_name);
    }
    if (phone) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    // Only administrators may move a staff member to another branch
    if (branch_id !== undefined && req.user!.role === UserRole.ADMIN) {
      if (branch_id !== null) {
        const branchCheck = await query('SELECT id FROM branches WHERE id = $1', [branch_id]);
        if (branchCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Selected branch does not exist' });
        }
      }
      updates.push(`branch_id = $${paramCount++}`);
      values.push(branch_id === null ? null : Number(branch_id));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    
    const result = await query(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, email, full_name, phone, role, status, branch_id`,
      values
    );
    
    res.json({ 
      message: 'User updated successfully',
      user: result.rows[0] 
    });
  } catch (error: any) {
    if (error.message.includes('duplicate key')) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

export const approveUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `UPDATE users SET status = $1
       WHERE id = $2
       RETURNING id, email, full_name, role, status`,
      [UserStatus.ACTIVE, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'User approved successfully',
      user: result.rows[0] 
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ error: 'Failed to approve user' });
  }
};

export const changeUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { id } = req.params;
    const { role } = req.body;
    
    // Prevent changing own role
    if (req.user!.id === parseInt(id)) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }
    
    const result = await query(
      `UPDATE users SET role = $1
       WHERE id = $2
       RETURNING id, email, full_name, role, status`,
      [role, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'User role updated successfully',
      user: result.rows[0] 
    });
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json({ error: 'Failed to change user role' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Prevent self-deletion
    if (req.user!.id === parseInt(id)) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // BUSINESS RULE: Check if user has created orders with pending payments or not delivered
    const ordersCheck = await query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN payment_status IN ('UNPAID', 'PARTIAL') THEN 1 END) as unpaid_orders,
        COUNT(CASE WHEN order_status NOT IN ('delivered', 'cancelled') THEN 1 END) as pending_orders
      FROM orders 
      WHERE user_id = $1
    `, [id]);
    
    const totalOrders = parseInt(ordersCheck.rows[0].total_orders);
    const unpaidOrders = parseInt(ordersCheck.rows[0].unpaid_orders);
    const pendingOrders = parseInt(ordersCheck.rows[0].pending_orders);
    
    // Cannot delete user (admin/agent) if they have:
    // 1. Orders with unpaid/partial payments
    // 2. Orders that are not delivered or cancelled
    if (unpaidOrders > 0 || pendingOrders > 0) {
      const reasons = [];
      if (unpaidOrders > 0) {
        reasons.push(`${unpaidOrders} order${unpaidOrders > 1 ? 's' : ''} with pending payments`);
      }
      if (pendingOrders > 0) {
        reasons.push(`${pendingOrders} order${pendingOrders > 1 ? 's' : ''} not yet delivered/cancelled`);
      }
      
      return res.status(400).json({ 
        error: `❌ Cannot delete user who created ${reasons.join(' and ')}. User can only be deleted when all their orders are fully paid and delivered.`,
        unpaidOrders,
        pendingOrders,
        totalOrders,
        businessRule: 'DELETION_PROTECTION'
      });
    }
    
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id, full_name', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: `User "${result.rows[0].full_name}" deleted successfully (${totalOrders} completed orders archived)`,
      deletedOrders: totalOrders
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// Get user notification preferences
export const getUserPreferences = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await query(
      `SELECT email_notifications, desktop_notifications, sound_alerts, in_app_notifications
       FROM user_preferences
       WHERE user_id = $1 AND tenant_id = app_current_tenant_id()`,
      [userId]
    );

    // If no preferences exist, create default ones
    if (result.rows.length === 0) {
      const defaultPrefs = {
        email_notifications: true,
        desktop_notifications: false,
        sound_alerts: false,
        in_app_notifications: true
      };

      await query(
        `INSERT INTO user_preferences (tenant_id, user_id, email_notifications, desktop_notifications, sound_alerts, in_app_notifications)
         VALUES (app_current_tenant_id(), $1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, user_id) DO NOTHING`,
        [userId, defaultPrefs.email_notifications, defaultPrefs.desktop_notifications, defaultPrefs.sound_alerts, defaultPrefs.in_app_notifications]
      );

      return res.json(defaultPrefs);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
};

// Update user notification preferences
export const updateUserPreferences = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { email_notifications, desktop_notifications, sound_alerts, in_app_notifications } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await query(
      `INSERT INTO user_preferences (tenant_id, user_id, email_notifications, desktop_notifications, sound_alerts, in_app_notifications, updated_at)
       VALUES (app_current_tenant_id(), $1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         email_notifications = EXCLUDED.email_notifications,
         desktop_notifications = EXCLUDED.desktop_notifications,
         sound_alerts = EXCLUDED.sound_alerts,
         in_app_notifications = EXCLUDED.in_app_notifications,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, email_notifications, desktop_notifications, sound_alerts, in_app_notifications]
    );

    res.json({ 
      message: 'Preferences updated successfully',
      preferences: { email_notifications, desktop_notifications, sound_alerts, in_app_notifications }
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
};

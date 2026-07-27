import { Response } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth';
import { UserRole, UserStatus } from '../models/User';
import { userNotificationService } from '../services/user-notification.service';
import { isSystemAdminEmail } from '../utils/systemAdmin';
import { getEffectiveBargainLimit } from '../utils/roleLimits';
import { uploadProfileImageToSupabase } from '../services/supabaseStorage.service';
import { 
  logFailedLogin, 
  logSuccessfulLogin, 
  logAccountLocked, 
  logSuspiciousActivity 
} from '../utils/activityLogger';

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

export const register = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, password, full_name, phone, role } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Self-service registrations always require systems-admin approval.
    const status = UserStatus.PENDING;
    const allowedRoles = [UserRole.ADMIN, UserRole.MANAGER, UserRole.DESKTOP_AGENT];
    const userRole = allowedRoles.includes(role) ? role : UserRole.DESKTOP_AGENT;

    const existingUserResult = await query(
      `SELECT id, email, deleted_at
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    let newUser;

    if (existingUserResult.rows.length > 0) {
      const existingUser = existingUserResult.rows[0];

      if (existingUser.deleted_at) {
        const hasDeletedBy = await tableHasColumn('users', 'deleted_by');
        const restoreQuery = hasDeletedBy
          ? `UPDATE users
             SET password = $1,
                 full_name = $2,
                 phone = $3,
                 role = $4,
                 status = $5,
                 created_by = $6,
                 deleted_at = NULL,
                 deleted_by = NULL,
                 rejection_reason = NULL,
                 must_change_password = FALSE,
                 failed_login_attempts = 0,
                 account_locked_until = NULL,
                 last_failed_login = NULL,
                 updated_at = NOW()
             WHERE id = $7
             RETURNING id, email, full_name, phone, role, status, created_at`
          : `UPDATE users
             SET password = $1,
                 full_name = $2,
                 phone = $3,
                 role = $4,
                 status = $5,
                 created_by = $6,
                 deleted_at = NULL,
                 rejection_reason = NULL,
                 must_change_password = FALSE,
                 failed_login_attempts = 0,
                 account_locked_until = NULL,
                 last_failed_login = NULL,
                 updated_at = NOW()
             WHERE id = $7
             RETURNING id, email, full_name, phone, role, status, created_at`;

        const result = await query(restoreQuery, [
          hashedPassword,
          full_name,
          phone,
          userRole,
          status,
          req.user?.id || null,
          existingUser.id,
        ]);

        newUser = result.rows[0];
      } else {
        return res.status(409).json({ error: 'Email already exists' });
      }
    } else {
      const result = await query(
        `INSERT INTO users (email, password, full_name, phone, role, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, full_name, phone, role, status, created_at`,
        [email, hashedPassword, full_name, phone, userRole, status, req.user?.id || null]
      );

      newUser = result.rows[0];
    }

    // Send email notification to admins if user is pending
    if (status === UserStatus.PENDING) {
      userNotificationService.notifyAdminsOfPendingUser({
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        phone,
        role: newUser.role,
        created_at: newUser.created_at,
      }).catch(err => {
        console.error('Failed to send pending user notification:', err);
        // Don't fail registration if email fails
      });
    }
    
    res.status(201).json({
      message: status === UserStatus.PENDING 
        ? 'Registration successful. Awaiting admin approval.' 
        : 'User created successfully',
      user: newUser,
    });
  } catch (error: any) {
    if (error?.code === '23505' || error?.message?.includes('duplicate key')) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;
    
    // Get client IP and user agent for security logging
    const clientIP = req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    const MAX_FAILED_ATTEMPTS = 5;
    const LOCKOUT_DURATION_MINUTES = 30;

    const result = await query(
      `SELECT id, email, password, full_name, phone, role, status, profile_picture, profile_picture_url,
              failed_login_attempts, account_locked_until, last_failed_login
       FROM users WHERE email = $1`,
      [email]
    );
    
    if (result.rows.length === 0) {
      // Log failed login attempt - user not found
      await logFailedLogin(email, clientIP, userAgent, 'User not found');
      
      // Generic error message - don't reveal that email doesn't exist
      return res.status(401).json({ error: 'Incorrect login credentials' });
    }
    
    const user = result.rows[0];

    // Check if account is currently locked out (per-account brute-force protection)
    if (user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
      const lockedUntil = new Date(user.account_locked_until);
      const remainingMs = lockedUntil.getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      await logFailedLogin(email, clientIP, userAgent, `Account locked until ${lockedUntil.toISOString()}`);
      return res.status(429).json({
        error: `Account is temporarily locked due to too many failed login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.`,
        locked: true,
        locked_until: lockedUntil.toISOString(),
        remaining_minutes: remainingMinutes,
      });
    }
    
    // Check if user is active
    if (user.status !== UserStatus.ACTIVE) {
      // Log failed login attempt - inactive account
      await logFailedLogin(email, clientIP, userAgent, `Account not active: ${user.status}`);
      
      // Provide specific error messages based on status
      let errorMessage = 'Account is not active';
      if (user.status === UserStatus.PENDING) {
        errorMessage = 'Your account is awaiting approval. Please wait for an administrator to approve your access.';
      } else if (user.status === UserStatus.SUSPENDED) {
        errorMessage = 'Your account has been suspended. Please contact an administrator.';
      } else if (user.status === UserStatus.REJECTED) {
        errorMessage = 'Your account registration was rejected. Please contact an administrator.';
      }
      
      return res.status(403).json({ 
        error: errorMessage,
        status: user.status 
      });
    }
    
    // If password is missing, this account cannot use password login.
    if (!user.password) {
      await logFailedLogin(email, clientIP, userAgent, 'Account has no password set');
      return res.status(401).json({ 
        error: 'This account has no password set. Please contact the systems administrator.'
      });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      // Increment failed attempt counter and potentially lock the account
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      let lockUntil: Date | null = null;
      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      }

      await query(
        `UPDATE users
         SET failed_login_attempts = $1,
             last_failed_login = NOW(),
             account_locked_until = $2
         WHERE id = $3`,
        [newAttempts, lockUntil, user.id]
      );

      // Log failed login attempt - wrong password
      await logFailedLogin(email, clientIP, userAgent, `Invalid password (attempt ${newAttempts})`);

      if (lockUntil) {
        await logAccountLocked(user.id, email, clientIP, newAttempts);
        const remainingMinutes = LOCKOUT_DURATION_MINUTES;
        return res.status(429).json({
          error: `Too many failed login attempts. Your account has been locked for ${remainingMinutes} minutes.`,
          locked: true,
          locked_until: lockUntil.toISOString(),
          remaining_minutes: remainingMinutes,
        });
      }

      const attemptsLeft = MAX_FAILED_ATTEMPTS - newAttempts;
      return res.status(401).json({
        error: `Incorrect login credentials. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining before account is locked.`,
        attempts_remaining: attemptsLeft,
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        full_name: user.full_name, 
        role: user.role,
        profile_picture: user.profile_picture,
        profile_picture_url: user.profile_picture_url,
        is_system_admin: isSystemAdminEmail(user.email)
      },
      config.jwt.secret,
      { expiresIn: '7d' }  // Fixed expiration time
    );
    
    // Update last_login timestamp, reset failed attempts, and get updated user data
    const updatedUserResult = await query(
      `UPDATE users
       SET last_login = NOW(),
           failed_login_attempts = 0,
           account_locked_until = NULL,
           last_failed_login = NULL
       WHERE id = $1 
       RETURNING id, email, full_name, phone, role, status, profile_picture, profile_picture_url,
                 created_at, updated_at, last_login, max_bargain_amount`,
      [user.id]
    );
    
    const updatedUser = updatedUserResult.rows[0];
    updatedUser.is_system_admin = isSystemAdminEmail(updatedUser.email);
    updatedUser.max_bargain_amount = getEffectiveBargainLimit(
      updatedUser.role,
      updatedUser.max_bargain_amount
    );
    
    // Auto-cancel any pending password reset requests (user successfully logged in, so they remember their password)
    try {
      const cancelResult = await query(
        `DELETE FROM password_reset_requests 
         WHERE user_id = $1 AND status = 'PENDING'
         RETURNING id`,
        [user.id]
      );
      
      if (cancelResult.rows.length > 0) {
        console.log(`Auto-cancelled ${cancelResult.rows.length} pending password reset request(s) for user ${email} - successful login`);
      }
    } catch (cancelError) {
      console.warn('Failed to auto-cancel password reset requests (non-critical):', cancelError);
    }
    
    // Log successful login
    await logSuccessfulLogin(user.id, email, user.full_name, user.role, clientIP, userAgent);
    
    res.json({
      token,
      user: updatedUser
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, phone, role, status, profile_picture, profile_picture_url,
              created_at, updated_at, last_login, auth_provider, max_bargain_amount 
       FROM users WHERE id = $1`,
      [req.user!.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    user.is_system_admin = isSystemAdminEmail(user.email);
    user.max_bargain_amount = getEffectiveBargainLimit(user.role, user.max_bargain_amount);
    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

export const forgotPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;
    
    // Check if user exists
    const result = await query(
      'SELECT id, email, full_name, role FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      // Don't reveal if email exists or not for security
      return res.json({ 
        message: 'If the email exists, a password reset request has been sent to administrators.' 
      });
    }
    
    const user = result.rows[0];
    
    // Create a password reset request (stored in database for admin review)
    // If user already has a request (COMPLETED or DENIED), reset it to PENDING
    await query(
      `INSERT INTO password_reset_requests (user_id, requested_at, status)
       VALUES ($1, NOW(), 'PENDING')
       ON CONFLICT (user_id) 
       DO UPDATE SET requested_at = NOW(), status = 'PENDING', resolved_at = NULL, resolved_by = NULL`,
      [user.id]
    );
    
    // TODO: In production, send notification to admins (email/SMS)
    console.log(`Password reset requested for user: ${user.email}`);
    
    res.json({ 
      message: 'If the email exists, a password reset request has been sent to administrators.' 
    });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
};

export const updateSessionTimeout = async (req: AuthRequest, res: Response) => {
  try {
    const { minutes } = req.body;
    const userId = req.user!.id;
    
    // Session timeout feature removed - feature no longer supported
    return res.status(410).json({ error: 'Session timeout customization has been removed' });
  } catch (error) {
    console.error('Update session timeout error:', error);
    res.status(500).json({ error: 'Failed to update session timeout' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;
    
    // Validate input
    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    
    // Get user's current password
    const result = await query(
      'SELECT password FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required' });
    }
    
    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password and clear must_change_password flag
    await query(
      'UPDATE users SET password = $1, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedNewPassword, userId]
    );
    
    console.log(`✅ Password changed successfully for user ${userId}`);
    
    // Log password change event
    await query(
      `INSERT INTO activity_logs (user_id, action, details)
       VALUES ($1, $2, $3)`,
      [userId, 'password_changed', JSON.stringify({ changed_at: new Date() })]
    );
    
    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { full_name, phone } = req.body;
    const userId = req.user!.id;
    
    // Validate input
    if (!full_name || !phone) {
      return res.status(400).json({ error: 'Full name and phone are required' });
    }
    
    // Validate phone number format (must include country code)
    if (!/^\+\d{10,15}$/.test(phone)) {
      return res.status(400).json({ 
        error: 'Phone number must include country code and be 10-15 digits (e.g., +256700000000 for Uganda)' 
      });
    }
    
    // Update user profile
    const result = await query(
      `UPDATE users 
       SET full_name = $1, phone = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3
       RETURNING id, email, full_name, phone, role, status, profile_picture, profile_picture_url, created_at, updated_at, last_login, auth_provider`,
      [full_name, phone, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`✅ Profile updated for user ${userId}`);
    
    const updatedUser = result.rows[0];
    updatedUser.is_system_admin = isSystemAdminEmail(updatedUser.email);

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

export const uploadProfilePicture = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const uploadResult = await uploadProfileImageToSupabase(file, userId);

    // Update user's profile picture in database with persistent URL storage.
    const result = await query(
      `UPDATE users 
       SET profile_picture = $1,
           profile_picture_url = $2,
           profile_picture_storage = 'SUPABASE',
           profile_picture_migrated_at = NOW(),
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3
       RETURNING profile_picture, profile_picture_url`,
      [uploadResult.publicUrl, uploadResult.publicUrl, userId]
    );

    console.log(`✅ Profile picture updated for user ${userId}: ${uploadResult.publicUrl}`);
    
    res.json({
      message: 'Profile picture uploaded successfully',
      profile_picture: result.rows[0].profile_picture,
      profile_picture_url: result.rows[0].profile_picture_url
    });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
};

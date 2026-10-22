import nodemailer from 'nodemailer';
import { query } from '../config/database';

/**
 * User Notification Service
 * Sends notifications to administrators about pending user registrations
 */
export class UserNotificationService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  /**
   * Get all administrator emails
   */
  async getAdminEmails(): Promise<string[]> {
    const result = await query(
      `SELECT email FROM users 
       WHERE role = 'ADMIN' AND status = 'ACTIVE' AND email IS NOT NULL AND email != ''
       ORDER BY email`
    );
    
    return result.rows.map(row => row.email);
  }

  /**
   * Send notification to admins when new user registers
   */
  async notifyAdminsOfPendingUser(userData: {
    id: number;
    email: string;
    full_name: string;
    phone: string;
    role: string;
    created_at: Date;
  }): Promise<{ success: boolean; message: string; sentTo?: string[] }> {
    try {
      console.log('📧 Sending pending user notification to admins...');

      // Get admin emails
      const adminEmails = await this.getAdminEmails();
      
      if (adminEmails.length === 0) {
        console.log('⚠️  No active administrator emails found');
        return {
          success: false,
          message: 'No active administrator emails configured',
        };
      }

      console.log(`📬 Found ${adminEmails.length} administrator email(s)`);

      // Format email content
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px 10px 0 0;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .content {
      background: #f9fafb;
      padding: 30px;
      border: 1px solid #e5e7eb;
      border-top: none;
    }
    .user-info {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      border-left: 4px solid #f59e0b;
    }
    .info-row {
      display: flex;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      font-weight: bold;
      width: 120px;
      color: #6b7280;
    }
    .info-value {
      color: #111827;
    }
    .action-button {
      display: inline-block;
      padding: 12px 24px;
      background: #10b981;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin: 10px 5px;
      font-weight: bold;
    }
    .reject-button {
      background: #ef4444;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #6b7280;
      font-size: 12px;
    }
    .pending-badge {
      display: inline-block;
      background: #fbbf24;
      color: #78350f;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔔 New User Registration</h1>
    <p style="margin: 10px 0 0 0;">Action Required: Pending Approval</p>
  </div>
  
  <div class="content">
    <p>Hello Administrator,</p>
    
    <p>A new user has registered on the Hommiez Wash Laundry and Dry Cleaners and is awaiting your approval.</p>
    
    <div class="user-info">
      <div style="text-align: center; margin-bottom: 15px;">
        <span class="pending-badge">⏳ PENDING APPROVAL</span>
      </div>
      
      <div class="info-row">
        <span class="info-label">Full Name:</span>
        <span class="info-value">${userData.full_name}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Email:</span>
        <span class="info-value">${userData.email}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Phone:</span>
        <span class="info-value">${userData.phone}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Requested Role:</span>
        <span class="info-value"><strong>${userData.role}</strong></span>
      </div>
      <div class="info-row">
        <span class="info-label">Registered:</span>
        <span class="info-value">${new Date(userData.created_at).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}</span>
      </div>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <p style="font-weight: bold; color: #111827;">Please review this registration:</p>
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/user-management" class="action-button">
        ✅ Review & Approve
      </a>
    </div>
    
    <div style="background: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b;">
      <p style="margin: 0; font-size: 14px;">
        <strong>⚡ Quick Actions:</strong><br>
        1. Login to Hommiez Wash Laundry and Dry Cleaners<br>
        2. Go to User Management<br>
        3. Click "Pending Approval" tab<br>
        4. Approve or Reject the user
      </p>
    </div>
  </div>
  
  <div class="footer">
    <p>
      <strong>Hommiez Wash Laundry and Dry Cleaners</strong><br>
      This is an automated notification email<br>
      Generated on ${new Date().toLocaleString('en-GB')}
    </p>
  </div>
</body>
</html>
      `;

      // Send email to all admins
      const mailOptions = {
        from: `"Hommiez Wash Laundry and Dry Cleaners" <${process.env.EMAIL_USER}>`,
        to: adminEmails.join(', '),
        subject: `🔔 New User Registration Pending Approval - ${userData.full_name} (${userData.role})`,
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      
      console.log(`✅ Pending user notification sent successfully to: ${adminEmails.join(', ')}`);
      
      return {
        success: true,
        message: `Notification sent to ${adminEmails.length} administrator(s)`,
        sentTo: adminEmails,
      };
    } catch (error) {
      console.error('❌ Failed to send pending user notification:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send notification email',
      };
    }
  }

  /**
   * Send notification when user is approved
   */
  async notifyUserApproved(userData: {
    email: string;
    full_name: string;
    role: string;
  }): Promise<boolean> {
    try {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
    .header { background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .success-badge { background: #d1fae5; color: #065f46; padding: 8px 16px; border-radius: 6px; font-weight: bold; }
    .button { display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>✅ Account Approved!</h1>
  </div>
  <div class="content">
    <p>Hello ${userData.full_name},</p>
    <p style="text-align: center; margin: 20px 0;">
      <span class="success-badge">🎉 YOUR ACCOUNT HAS BEEN APPROVED</span>
    </p>
    <p>Great news! Your Hommiez Wash Laundry and Dry Cleaners account has been approved by an administrator.</p>
    <p><strong>Your Role:</strong> ${userData.role}</p>
    <p>You can now login to the system using your email and password:</p>
    <div style="text-align: center;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" class="button">Login to Hommiez Wash Laundry and Dry Cleaners</a>
    </div>
    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      If you have any questions, please contact your system administrator.
    </p>
  </div>
</body>
</html>
      `;

      await this.transporter.sendMail({
        from: `"Hommiez Wash Laundry and Dry Cleaners" <${process.env.EMAIL_USER}>`,
        to: userData.email,
        subject: '✅ Your Hommiez Wash Laundry and Dry Cleaners Account Has Been Approved!',
        html: htmlContent,
      });

      console.log(`✅ Approval notification sent to: ${userData.email}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send approval notification:', error);
      return false;
    }
  }

  /**
   * Send notification when user is rejected
   */
  async notifyUserRejected(userData: {
    email: string;
    full_name: string;
    role: string;
    rejection_reason?: string;
  }): Promise<boolean> {
    try {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
    .header { background: #ef4444; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .warning-box { background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>❌ Account Registration Update</h1>
  </div>
  <div class="content">
    <p>Hello ${userData.full_name},</p>
    <p>We regret to inform you that your registration for the Hommiez Wash Laundry and Dry Cleaners has not been approved at this time.</p>
    ${userData.rejection_reason ? `
    <div class="warning-box">
      <strong>Reason:</strong> ${userData.rejection_reason}
    </div>
    ` : ''}
    <p>If you believe this is an error or would like more information, please contact your system administrator directly.</p>
    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Thank you for your understanding.
    </p>
  </div>
</body>
</html>
      `;

      await this.transporter.sendMail({
        from: `"Hommiez Wash Laundry and Dry Cleaners" <${process.env.EMAIL_USER}>`,
        to: userData.email,
        subject: '⚠️ Hommiez Wash Laundry and Dry Cleaners Account Registration Update',
        html: htmlContent,
      });

      console.log(`✅ Rejection notification sent to: ${userData.email}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send rejection notification:', error);
      return false;
    }
  }
}

// Export singleton instance
export const userNotificationService = new UserNotificationService();

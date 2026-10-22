import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { emailBackupService } from '../services/email-backup.service';
import { notifyBackupSuccess, notifyBackupFailure } from '../services/notification.service';
import { generateBackupPDF } from '../services/backup-pdf.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Create database backup 
 */
export const createBackup = async (req: AuthRequest, res: Response) => {
  try {
    const { tables, format, from_date, to_date } = req.body; // 'all', 'customers', 'orders,order_items', etc.

    // PDF path — separate branch, returns early
    if (format === 'pdf') {
      const pdfBuffer = await generateBackupPDF(tables || 'all', { fromDate: from_date, toDate: to_date });
      const timestamp = new Date().toISOString().split('T')[0];
      const typeLabel = tables === 'all' || !tables ? 'full' : String(tables).replace(/,/g, '_');
      const filename = `hommiez_wash_${typeLabel}_backup_${timestamp}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);

      // Log to history the same way the JSON path does
      try {
        const sizeKB = (pdfBuffer.length / 1024).toFixed(2);
        await query(
          `INSERT INTO backup_history (tenant_id, type, created_by, size)
           VALUES (app_current_tenant_id(), $1, $2, $3)`,
          [`PDF: ${typeLabel}`, req.user?.email, `${sizeKB} KB`]
        );
      } catch (historyError) {
        console.error('Failed to log PDF backup to history:', historyError);
      }
      return;
    }
    
    const backupData: any = {
      timestamp: new Date().toISOString(),
      created_by: req.user?.email,
      version: '1.0',
      data: {},
    };
    
    // Parse tables - handle both string and array formats
    let tablesToBackup: string[];
    if (tables === 'all') {
      tablesToBackup = ['customers', 'orders', 'order_items', 'users', 'price_items', 'inventory_items', 'inventory_transactions', 'deliveries', 'expenses', 'notifications', 'payments'];
    } else if (typeof tables === 'string') {
      tablesToBackup = tables.split(',').map((t: string) => t.trim());
    } else if (Array.isArray(tables)) {
      tablesToBackup = tables;
    } else {
      tablesToBackup = ['customers', 'orders', 'order_items', 'users', 'price_items', 'inventory_items', 'inventory_transactions', 'deliveries', 'expenses', 'notifications', 'payments'];
    }

    const allowedBackupTables = new Set([
      'customers', 'orders', 'order_items', 'users', 'price_items',
      'inventory_items', 'inventory_transactions', 'deliveries', 'expenses',
      'notifications', 'payments', 'pending_payments', 'payroll_employees',
      'salary_payments', 'business_settings', 'automation_settings',
    ]);
    if (tablesToBackup.some((table) => !allowedBackupTables.has(table))) {
      return res.status(400).json({ error: 'One or more requested tables cannot be backed up.' });
    }
    
    // Export each table
    for (const table of tablesToBackup) {
      try {
        const result = await query(`SELECT * FROM public.${table} WHERE tenant_id = app_current_tenant_id()`);
        backupData.data[table] = result.rows;
      } catch (err) {
        console.error(`Error backing up table ${table}:`, err);
        // Continue with other tables even if one fails
      }
    }
    
    // Calculate backup size
    const backupString = JSON.stringify(backupData);
    const sizeInBytes = Buffer.byteLength(backupString, 'utf8');
    const sizeInKB = (sizeInBytes / 1024).toFixed(2);
    const backupSize = sizeInBytes > 1024 * 1024 
      ? `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB` 
      : `${sizeInKB} KB`;
    
    // Log backup to history
    try {
      const backupType = tables === 'all' ? 'Full Backup' : `Partial: ${tables}`;
      await query(
        `INSERT INTO backup_history (tenant_id, type, created_by, size)
         VALUES (app_current_tenant_id(), $1, $2, $3)`,
        [backupType, req.user?.email, backupSize]
      );
    } catch (historyError) {
      console.error('Failed to log backup to history:', historyError);
    }
    
    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const typeLabel = tables === 'all' ? 'full' : tables.replace(/,/g, '_');
    const filename = `hommiez_wash_${typeLabel}_backup_${timestamp}.json`;
    
    // Send notification to administrators
    const backupType = tables === 'all' ? 'Full Backup' : `Partial Backup: ${tables}`;
    await notifyBackupSuccess(backupSize, backupType, req.user?.id);
    
    // Set response headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.json(backupData);
  } catch (error) {
    console.error('Create backup error:', error);
    
    // Send failure notification to administrators
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await notifyBackupFailure(errorMessage, req.user?.id);
    
    res.status(500).json({ error: 'Failed to create backup' });
  }
};

/**
 * Get backup statistics
 */
export const getBackupStats = async (req: AuthRequest, res: Response) => {
  try {
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM customers) as customers,
        (SELECT COUNT(*) FROM orders) as orders,
        (SELECT COUNT(*) FROM inventory_items) as inventory,
        (SELECT COUNT(*) FROM deliveries) as deliveries,
        (SELECT pg_size_pretty(pg_database_size(current_database()))) as size
    `);
    
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Get backup stats error:', error);
    res.status(500).json({ error: 'Failed to fetch backup statistics' });
  }
};

/**
 * Delete old data (for data management)
 */
export const deleteOldData = async (req: AuthRequest, res: Response) => {
  try {
    const { table, before_date } = req.body;
    
    if (!['orders', 'customers'].includes(table)) {
      return res.status(400).json({ error: 'Invalid table specified' });
    }
    
    let result: any = null;
    
    if (table === 'orders') {
      // Delete orders older than specified date
      result = await query(
        'DELETE FROM orders WHERE created_at < $1',
        [before_date]
      );
    } else if (table === 'customers') {
      // Delete inactive customers older than specified date
      result = await query(
        'DELETE FROM customers WHERE is_active = FALSE AND created_at < $1',
        [before_date]
      );
    }
    
    if (!result) {
      return res.status(400).json({ error: 'No operation performed' });
    }
    
    res.json({
      message: `Deleted ${result.rowCount} records from ${table}`,
      deleted_count: result.rowCount,
    });
  } catch (error) {
    console.error('Delete old data error:', error);
    res.status(500).json({ error: 'Failed to delete old data' });
  }
};

/**
 * Get backup history (recent backups)
 */
export const getBackupHistory = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT * FROM backup_history 
      WHERE tenant_id = app_current_tenant_id()
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get backup history error:', error);
    res.status(500).json({ error: 'Failed to fetch backup history' });
  }
};

/**
 * Save email backup settings
 */
export const saveEmailBackupSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { enabled, email, frequency, categories } = req.body;
    
    // Check if settings exist
    const existing = await query('SELECT * FROM backup_email_settings WHERE tenant_id = app_current_tenant_id() LIMIT 1');
    
    if (existing.rows.length > 0) {
      // Update existing
      await query(
        `UPDATE backup_email_settings 
         SET enabled = $1, email = $2, frequency = $3, categories = $4,
             updated_at = CURRENT_TIMESTAMP, updated_by = $5
         WHERE id = $6 AND tenant_id = app_current_tenant_id()`,
        [enabled, email, frequency, JSON.stringify(categories || ['orders', 'customers', 'payments']), req.user?.email, existing.rows[0].id]
      );
    } else {
      // Insert new
      await query(
        `INSERT INTO backup_email_settings (tenant_id, enabled, email, frequency, categories, updated_by)
         VALUES (app_current_tenant_id(), $1, $2, $3, $4, $5)`,
        [enabled, email, frequency, JSON.stringify(categories || ['orders', 'customers', 'payments']), req.user?.email]
      );
    }
    
    res.json({ 
      message: 'Email backup settings saved successfully',
      settings: { enabled, email, frequency, categories }
    });
  } catch (error) {
    console.error('Save email backup settings error:', error);
    res.status(500).json({ error: 'Failed to save email backup settings' });
  }
};

/**
 * Get email backup settings
 */
export const getEmailBackupSettings = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT * FROM backup_email_settings WHERE tenant_id = app_current_tenant_id() LIMIT 1');
    
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.json({ 
        enabled: false, 
        email: '', 
        frequency: 'daily',
        categories: ['orders', 'customers', 'payments']
      });
    }
  } catch (error) {
    console.error('Get email backup settings error:', error);
    res.status(500).json({ error: 'Failed to fetch email backup settings' });
  }
};

/**
 * Send daily backup email manually (test/trigger)
 */
export const sendDailyBackupEmail = async (req: AuthRequest, res: Response) => {
  try {
    const result = await emailBackupService.sendDailyBackup();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        sentTo: result.sentTo,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    console.error('Send daily backup email error:', error);
    res.status(500).json({ error: 'Failed to send daily backup email' });
  }
};


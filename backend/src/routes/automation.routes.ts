import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();

// GET /api/automation-settings - Get all automation settings
router.get('/', authenticate as any, async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT setting_key, setting_value, description, updated_at
      FROM automation_settings
      WHERE tenant_id = app_current_tenant_id()
      ORDER BY setting_key
    `);

    // Convert to key-value object for easier frontend consumption
    const settings: Record<string, boolean> = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    res.json({
      success: true,
      settings,
      details: result.rows
    });
  } catch (error: any) {
    console.error('❌ Error fetching automation settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch automation settings',
      error: error.message
    });
  }
});

// PUT /api/automation-settings - Update automation settings
router.put(
  '/',
  authenticate as any,
  authorize(UserRole.ADMIN, UserRole.MANAGER) as any,
  async (req: Request, res: Response) => {
  const {
    whatsapp_auto_send_receipt,
    whatsapp_auto_send_ready,
    whatsapp_auto_send_delivered
  } = req.body;

  try {
    const userId = (req as any).user.id;

    // Update each setting
    const updates = [
      { key: 'whatsapp_auto_send_receipt', value: whatsapp_auto_send_receipt },
      { key: 'whatsapp_auto_send_ready', value: whatsapp_auto_send_ready },
      { key: 'whatsapp_auto_send_delivered', value: whatsapp_auto_send_delivered }
    ].filter(setting => setting.value !== undefined);

    for (const setting of updates) {
      await query(`
        UPDATE automation_settings
        SET setting_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
        WHERE tenant_id = app_current_tenant_id() AND setting_key = $3
      `, [setting.value, userId, setting.key]);
    }

    // Fetch updated settings
    const result = await query(`
      SELECT setting_key, setting_value, description, updated_at
      FROM automation_settings
      WHERE tenant_id = app_current_tenant_id()
      ORDER BY setting_key
    `);

    const settings: Record<string, boolean> = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    res.json({
      success: true,
      message: 'Automation settings updated successfully',
      settings
    });
  } catch (error: any) {
    console.error('❌ Error updating automation settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update automation settings',
      error: error.message
    });
  }
});

export default router;

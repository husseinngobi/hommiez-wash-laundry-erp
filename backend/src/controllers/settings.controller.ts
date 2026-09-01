import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

interface BusinessHoursDay {
  open: string;
  close: string;
  closed: boolean;
}

interface BusinessHours {
  sunday: BusinessHoursDay;
  monday: BusinessHoursDay;
  tuesday: BusinessHoursDay;
  wednesday: BusinessHoursDay;
  thursday: BusinessHoursDay;
  friday: BusinessHoursDay;
  saturday: BusinessHoursDay;
}

export const getBusinessHours = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT setting_value FROM business_settings WHERE setting_key = 'business_hours'`
    );

    if (result.rows.length === 0) {
      // Return default business hours if not set
      return res.json({
        monday: { open: '07:00', close: '21:00', closed: false },
        tuesday: { open: '07:00', close: '21:00', closed: false },
        wednesday: { open: '07:00', close: '21:00', closed: false },
        thursday: { open: '07:00', close: '21:00', closed: false },
        friday: { open: '07:00', close: '21:00', closed: false },
        saturday: { open: '07:00', close: '21:00', closed: false },
        sunday: { open: '09:00', close: '15:00', closed: false },
      });
    }

    res.json(result.rows[0].setting_value);
  } catch (error) {
    console.error('Get business hours error:', error);
    res.status(500).json({ error: 'Failed to fetch business hours' });
  }
};

export const updateBusinessHours = async (req: AuthRequest, res: Response) => {
  try {
    const businessHours: BusinessHours = req.body;

    // Validate the structure
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      if (!businessHours[day as keyof BusinessHours]) {
        return res.status(400).json({ error: `Missing data for ${day}` });
      }
    }

    const result = await query(
      `INSERT INTO business_settings (setting_key, setting_value, updated_at)
       VALUES ('business_hours', $1, NOW())
       ON CONFLICT (setting_key) 
       DO UPDATE SET setting_value = $1, updated_at = NOW()
       RETURNING setting_value`,
      [JSON.stringify(businessHours)]
    );

    res.json(result.rows[0].setting_value);
  } catch (error) {
    console.error('Update business hours error:', error);
    res.status(500).json({ error: 'Failed to update business hours' });
  }
};
export const getAllSettings = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT setting_key, setting_value FROM business_settings`
    );

    const settings: Record<string, any> = {};
    result.rows.forEach((row) => {
      // Parse JSON values, handle strings
      try {
        settings[row.setting_key] = JSON.parse(row.setting_value);
      } catch {
        settings[row.setting_key] = row.setting_value;
      }
    });

    res.json(settings);
  } catch (error) {
    console.error('Get all settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

export const bulkUpdateSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings data' });
    }

    // Update each setting (undefined would stringify to `undefined` and break NOT NULL)
    for (const [key, value] of Object.entries(settings)) {
      await query(
        `INSERT INTO business_settings (setting_key, setting_value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (setting_key) 
         DO UPDATE SET setting_value = $2, updated_at = NOW()`,
        [key, JSON.stringify(value === undefined ? '' : value)]
      );
    }

    // Keep the legacy `vat_enabled` blob in step with the URA switch so the two
    // never disagree about whether VAT should be charged.
    if ('ura_compliance_enabled' in settings) {
      const enabled =
        settings.ura_compliance_enabled === true || settings.ura_compliance_enabled === 'true';
      const rate = parseFloat(String(settings.vat_rate ?? 18)) || 18;
      await query(
        `INSERT INTO business_settings (setting_key, setting_value, updated_at)
         VALUES ('vat_enabled', $1, NOW())
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = $1, updated_at = NOW()`,
        [JSON.stringify({ enabled, rate })]
      );
    }

    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Bulk update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};
const BUSINESS_INFO_KEYS = [
  'business_name',
  'business_phone',
  'business_email',
  'business_location',
  'business_address',
  'business_tin',
] as const;

function parseSettingValue(raw: any): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : String(parsed ?? '');
    } catch {
      return raw;
    }
  }
  return String(raw);
}

/**
 * Business identity used by receipts, invoices and WhatsApp messages.
 * Stored as flat setting keys so every consumer reads one source of truth.
 */
export const getBusinessInfo = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT setting_key, setting_value FROM business_settings
       WHERE setting_key = ANY($1::text[]) OR setting_key = 'business_info'`,
      [BUSINESS_INFO_KEYS as unknown as string[]]
    );

    const flat: Record<string, string> = {};
    let legacy: Record<string, string> = {};

    result.rows.forEach((row) => {
      if (row.setting_key === 'business_info') {
        const value = typeof row.setting_value === 'string'
          ? (() => { try { return JSON.parse(row.setting_value); } catch { return {}; } })()
          : row.setting_value || {};
        legacy = value || {};
        return;
      }
      flat[row.setting_key] = parseSettingValue(row.setting_value);
    });

    res.json({
      name: flat.business_name || legacy.name || 'Lush Dry Cleaners & Laundromat',
      phone: flat.business_phone || legacy.phone || '',
      email: flat.business_email || legacy.email || '',
      location: flat.business_location || legacy.location || '',
      address: flat.business_address || legacy.address || '',
      tin: flat.business_tin || legacy.tin || '',
    });
  } catch (error) {
    console.error('Get business info error:', error);
    res.status(500).json({ error: 'Failed to fetch business info' });
  }
};

export const updateBusinessInfo = async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, location, address, tin } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Business name is required' });
    }

    const values: Record<string, string> = {
      business_name: String(name).trim(),
      business_phone: String(phone || '').trim(),
      business_email: String(email || '').trim(),
      business_location: String(location || '').trim(),
      business_address: String(address || '').trim(),
    };
    if (tin !== undefined) {
      values.business_tin = String(tin).trim();
    }

    for (const [key, value] of Object.entries(values)) {
      await query(
        `INSERT INTO business_settings (setting_key, setting_value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = $2, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
    }

    res.json({
      message: 'Business information updated',
      name: values.business_name,
      phone: values.business_phone,
      email: values.business_email,
      location: values.business_location,
      address: values.business_address,
      tin: values.business_tin ?? '',
    });
  } catch (error) {
    console.error('Update business info error:', error);
    res.status(500).json({ error: 'Failed to update business info' });
  }
};

// VAT Settings
export const getVATSettings = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT setting_value FROM business_settings WHERE setting_key = 'vat_enabled'`
    );

    if (result.rows.length === 0) {
      // Return default (VAT disabled)
      return res.json({
        enabled: false,
        rate: 18
      });
    }

    res.json(result.rows[0].setting_value);
  } catch (error) {
    console.error('Get VAT settings error:', error);
    res.status(500).json({ error: 'Failed to fetch VAT settings' });
  }
};

export const updateVATSettings = async (req: AuthRequest, res: Response) => {
  try {
    // Only ADMIN can toggle VAT
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can change VAT settings' });
    }

    const { enabled, rate } = req.body;

    // Validate inputs
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const vatRate = parseFloat(rate) || 18;

    if (vatRate < 0 || vatRate > 100) {
      return res.status(400).json({ error: 'VAT rate must be between 0 and 100' });
    }

    const result = await query(
      `INSERT INTO business_settings (setting_key, setting_value, updated_at)
       VALUES ('vat_enabled', $1, NOW())
       ON CONFLICT (setting_key) 
       DO UPDATE SET setting_value = $1, updated_at = NOW()
       RETURNING setting_value`,
      [JSON.stringify({ enabled, rate: vatRate })]
    );

    // Log the change
    console.log(`✅ VAT ${enabled ? 'ENABLED' : 'DISABLED'} by ${req.user?.email} (Rate: ${vatRate}%)`);

    res.json({
      message: `VAT ${enabled ? 'enabled' : 'disabled'} successfully`,
      settings: result.rows[0].setting_value
    });
  } catch (error) {
    console.error('Update VAT settings error:', error);
    res.status(500).json({ error: 'Failed to update VAT settings' });
  }
};

export const getBargainLimits = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT role,
              MAX(max_bargain_amount)      AS overall_limit,
              MAX(max_item_bargain_amount) AS item_limit
       FROM users
       WHERE role IN ('DESKTOP_AGENT', 'MANAGER', 'ADMIN')
       GROUP BY role
       ORDER BY role`
    );

    const limits: Record<string, { overall: number; per_item: number }> = {
      desktop_agent: { overall: 5000, per_item: 1000 },
      manager:       { overall: 10000, per_item: 2000 },
      admin:         { overall: 50000, per_item: 10000 },
    };

    result.rows.forEach((row: any) => {
      const overall  = Number(row.overall_limit);
      const perItem  = Number(row.item_limit);
      const key = row.role === 'DESKTOP_AGENT' ? 'desktop_agent'
                : row.role === 'MANAGER'       ? 'manager'
                : row.role === 'ADMIN'         ? 'admin'
                : null;
      if (!key) return;
      if (Number.isFinite(overall) && overall >= 0) limits[key].overall  = overall;
      if (Number.isFinite(perItem) && perItem >= 0)  limits[key].per_item = perItem;
    });

    const discountResult = await query(
      `SELECT setting_value FROM business_settings WHERE setting_key = 'discount_limits'`
    );
    let discountLimits = { desktop_agent: 10, manager: 20, admin: 100 };
    if (discountResult.rows[0]?.setting_value) {
      try {
        discountLimits = { ...discountLimits, ...JSON.parse(discountResult.rows[0].setting_value) };
      } catch {
        // Keep role defaults when the stored setting is malformed.
      }
    }

    // Flat structure for backward-compat + per-item and percentage fields
    res.json({
      desktop_agent:          limits.desktop_agent.overall,
      desktop_agent_per_item: limits.desktop_agent.per_item,
      manager:                limits.manager.overall,
      manager_per_item:       limits.manager.per_item,
      admin:                  limits.admin.overall,
      admin_per_item:         limits.admin.per_item,
      desktop_agent_discount_percent: Number.isFinite(Number(discountLimits.desktop_agent)) ? Number(discountLimits.desktop_agent) : 10,
      manager_discount_percent: Number.isFinite(Number(discountLimits.manager)) ? Number(discountLimits.manager) : 20,
      admin_discount_percent: Number.isFinite(Number(discountLimits.admin)) ? Number(discountLimits.admin) : 100,
    });
  } catch (error) {
    console.error('Get bargain limits error:', error);
    res.status(500).json({ error: 'Failed to fetch bargain limits' });
  }
};

export const updateBargainLimits = async (req: AuthRequest, res: Response) => {
  try {
    const {
      desktop_agent_limit,       manager_limit,       admin_limit,
      desktop_agent_item_limit,  manager_item_limit,  admin_item_limit,
      desktop_agent_discount_percent, manager_discount_percent, admin_discount_percent,
    } = req.body;

    // Accept numbers, numeric strings, and comma-formatted amounts ("5,000").
    // Empty / missing values become null so we can decide per-role.
    const parseLimit = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') return null;
      if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.round(value) : null;
      }
      if (typeof value === 'string') {
        const normalized = value.replace(/,/g, '').trim();
        if (!normalized) return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? Math.round(parsed) : null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.round(parsed) : null;
    };

    const desktopAgent     = parseLimit(desktop_agent_limit);
    const manager          = parseLimit(manager_limit);
    const admin            = parseLimit(admin_limit);
    const desktopAgentItem = parseLimit(desktop_agent_item_limit);
    const managerItem      = parseLimit(manager_item_limit);
    const adminItem        = parseLimit(admin_item_limit);
    const desktopAgentDiscount = parsePercent(desktop_agent_discount_percent, 10);
    const managerDiscount = parsePercent(manager_discount_percent, 20);
    const adminDiscount = parsePercent(admin_discount_percent, 100);

    if (desktopAgent === null || manager === null) {
      return res.status(400).json({
        error: 'Desktop agent and manager overall bargain limits must be valid numbers (e.g. 5000)',
      });
    }
    if (desktopAgentDiscount === null || managerDiscount === null || adminDiscount === null) {
      return res.status(400).json({ error: 'Discount percentages must be between 0 and 100' });
    }
    if (desktopAgentItem === null || managerItem === null) {
      return res.status(400).json({
        error: 'Desktop agent and manager per-item bargain limits must be valid numbers',
      });
    }
    if (desktopAgent < 0 || manager < 0 || (admin !== null && admin < 0)) {
      return res.status(400).json({ error: 'Bargain limits cannot be negative' });
    }
    if (desktopAgentItem > desktopAgent) {
      return res.status(400).json({
        error: 'Per-item limit cannot exceed the overall limit for desktop agents',
      });
    }
    if (managerItem > manager) {
      return res.status(400).json({
        error: 'Per-item limit cannot exceed the overall limit for managers',
      });
    }
    if (managerDiscount < desktopAgentDiscount || adminDiscount < managerDiscount) {
      return res.status(400).json({ error: 'Discount percentages must follow Desktop Agent <= Manager <= Administrator' });
    }

    await query(
      `UPDATE users SET max_bargain_amount = $1, max_item_bargain_amount = $2 WHERE role = 'DESKTOP_AGENT'`,
      [desktopAgent, desktopAgentItem]
    );
    await query(
      `UPDATE users SET max_bargain_amount = $1, max_item_bargain_amount = $2 WHERE role = 'MANAGER'`,
      [manager, managerItem]
    );
    if (admin !== null) {
      await query(
        `UPDATE users SET max_bargain_amount = $1, max_item_bargain_amount = $2 WHERE role = 'ADMIN'`,
        [admin, adminItem ?? 0]
      );
    }

    await query(
      `INSERT INTO business_settings (setting_key, setting_value, updated_at)
       VALUES ('discount_limits', $1, NOW())
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = NOW()`,
      [JSON.stringify({ desktop_agent: desktopAgentDiscount, manager: managerDiscount, admin: adminDiscount })]
    );

    console.log(
      `✅ Bargain limits updated by ${req.user?.email} — ` +
      `agent ${desktopAgent} (item ${desktopAgentItem}), manager ${manager} (item ${managerItem})`
    );

    res.json({
      message: 'Bargain limits updated successfully',
      limits: {
        desktop_agent: desktopAgent, desktop_agent_per_item: desktopAgentItem,
        manager: manager,           manager_per_item: managerItem,
        admin: admin,               admin_per_item: adminItem,
      },
    });
  } catch (error) {
    console.error('Update bargain limits error:', error);
    res.status(500).json({ error: 'Failed to update bargain limits' });
  }
};

function parsePercent(value: unknown, fallback: number): number | null {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

const DEFAULT_PAYMENT_ACCOUNTS = {
  centenary_account: '3205564146',
  mtn_code: '30353491',
  airtel_merchant: '4403961',
};

/** Pay-in details for on-account / unpaid / partial WhatsApp receipts */
export const getPaymentAccounts = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT setting_value FROM business_settings WHERE setting_key = 'payment_accounts'`
    );
    if (result.rows.length === 0) {
      return res.json(DEFAULT_PAYMENT_ACCOUNTS);
    }
    const stored = result.rows[0].setting_value || {};
    res.json({ ...DEFAULT_PAYMENT_ACCOUNTS, ...stored });
  } catch (error) {
    console.error('Get payment accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch payment accounts' });
  }
};

export const updatePaymentAccounts = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can update payment accounts' });
    }

    const {
      centenary_account = DEFAULT_PAYMENT_ACCOUNTS.centenary_account,
      mtn_code = DEFAULT_PAYMENT_ACCOUNTS.mtn_code,
      airtel_merchant = DEFAULT_PAYMENT_ACCOUNTS.airtel_merchant,
    } = req.body;

    const value = {
      centenary_account: String(centenary_account || '').trim(),
      mtn_code: String(mtn_code || '').trim(),
      airtel_merchant: String(airtel_merchant || '').trim(),
    };

    const result = await query(
      `INSERT INTO business_settings (setting_key, setting_value, updated_at)
       VALUES ('payment_accounts', $1, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $1, updated_at = NOW()
       RETURNING setting_value`,
      [JSON.stringify(value)]
    );

    res.json({
      message: 'Payment accounts updated',
      accounts: result.rows[0].setting_value,
    });
  } catch (error) {
    console.error('Update payment accounts error:', error);
    res.status(500).json({ error: 'Failed to update payment accounts' });
  }
};

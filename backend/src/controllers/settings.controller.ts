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
    // Get bargain limits from sample users of each role
    const result = await query(
      `SELECT role, max_bargain_amount 
       FROM users 
       WHERE role IN ('DESKTOP_AGENT', 'MANAGER', 'ADMIN')
       GROUP BY role, max_bargain_amount
       ORDER BY role`
    );

    const limits: any = {
      desktop_agent: 5000, // defaults
      manager: 10000,
      admin: 50000,
    };

    result.rows.forEach(row => {
      const amount = Number(row.max_bargain_amount);
      if (!Number.isFinite(amount) || amount < 0) return;

      if (row.role === 'DESKTOP_AGENT') {
        limits.desktop_agent = amount;
      } else if (row.role === 'MANAGER') {
        limits.manager = amount;
      } else if (row.role === 'ADMIN') {
        limits.admin = amount;
      }
    });

    res.json(limits);
  } catch (error) {
    console.error('Get bargain limits error:', error);
    res.status(500).json({ error: 'Failed to fetch bargain limits' });
  }
};

export const updateBargainLimits = async (req: AuthRequest, res: Response) => {
  try {
    const { desktop_agent_limit, manager_limit, admin_limit } = req.body;

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

    const desktopAgent = parseLimit(desktop_agent_limit);
    const manager = parseLimit(manager_limit);
    const admin = parseLimit(admin_limit);

    if (desktopAgent === null || manager === null) {
      return res.status(400).json({
        error: 'Desktop agent and manager bargain limits must be valid numbers (e.g. 5000)',
      });
    }
    if (desktopAgent < 0 || manager < 0 || (admin !== null && admin < 0)) {
      return res.status(400).json({ error: 'Bargain limits cannot be negative' });
    }
    if (manager < desktopAgent) {
      return res.status(400).json({ error: 'Manager limit should not be lower than desktop agent limit' });
    }
    if (admin !== null && admin < manager) {
      return res.status(400).json({ error: 'Administrator limit should not be lower than manager limit' });
    }

    await query(
      `UPDATE users SET max_bargain_amount = $1 WHERE role = 'DESKTOP_AGENT'`,
      [desktopAgent]
    );

    await query(
      `UPDATE users SET max_bargain_amount = $1 WHERE role = 'MANAGER'`,
      [manager]
    );

    // Admin limit is optional — omit it to leave administrators unchanged
    if (admin !== null) {
      await query(
        `UPDATE users SET max_bargain_amount = $1 WHERE role = 'ADMIN'`,
        [admin]
      );
    }

    console.log(
      `✅ Bargain limits updated by ${req.user?.email} — agent ${desktopAgent}, manager ${manager}` +
        (admin !== null ? `, admin ${admin}` : ' (admin unchanged)')
    );

    res.json({
      message: 'Bargain limits updated successfully',
      limits: {
        desktop_agent: desktopAgent,
        manager: manager,
        admin: admin,
      },
    });
  } catch (error) {
    console.error('Update bargain limits error:', error);
    res.status(500).json({ error: 'Failed to update bargain limits' });
  }
};

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

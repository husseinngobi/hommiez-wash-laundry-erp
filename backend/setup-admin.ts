import { config } from './src/config';
import { closeDatabasePools, query } from './src/config/database';
import bcrypt from 'bcryptjs';

const setupSystemAdmin = async () => {
  const tenantId = Number.parseInt(process.env.SETUP_ADMIN_TENANT_ID || '2', 10);
  const email = (process.env.SETUP_ADMIN_EMAIL || '').trim().toLowerCase();
  const fullName = (process.env.SETUP_ADMIN_FULL_NAME || '').trim();
  const phone = (process.env.SETUP_ADMIN_PHONE || '').trim();
  const password = process.env.SETUP_ADMIN_PASSWORD || '';
  const systemAdminEmails = (process.env.SYSTEM_ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (tenantId !== 2 || config.tenancy.deploymentTenantId !== 2) {
    throw new Error('This Hommiez bootstrap is restricted to tenant 2. Set both tenant IDs to 2.');
  }
  if (!process.env.APP_DATABASE_URL) {
    throw new Error('Set APP_DATABASE_URL to the restricted runtime connection in backend/.env before running this setup.');
  }
  if (!email || !fullName || !phone || password.length < 12) {
    throw new Error('Set SETUP_ADMIN_EMAIL, SETUP_ADMIN_FULL_NAME, SETUP_ADMIN_PHONE, and a SETUP_ADMIN_PASSWORD of at least 12 characters.');
  }
  if (!systemAdminEmails.includes(email)) {
    throw new Error('SETUP_ADMIN_EMAIL must also be included in SYSTEM_ADMIN_EMAILS.');
  }

  const tenant = await query(
    'SELECT id FROM public.tenants WHERE id = $1 AND is_active = TRUE',
    [tenantId]
  );
  if (tenant.rowCount !== 1) {
    throw new Error(`Active tenant ${tenantId} was not found. No user was created.`);
  }

  const existing = await query(
    'SELECT id FROM public.users WHERE tenant_id = $1 AND LOWER(email) = $2 LIMIT 1',
    [tenantId, email]
  );
  if (existing.rowCount) {
    throw new Error(`A user with ${email} already exists in tenant ${tenantId}; no password or user data was changed.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const created = await query(
    `INSERT INTO public.users (tenant_id, email, password, full_name, phone, role, status)
     VALUES ($1, $2, $3, $4, $5, 'ADMIN', 'ACTIVE')
     RETURNING id, email, full_name, role, status, tenant_id`,
    [tenantId, email, passwordHash, fullName, phone]
  );

  console.log('Created the initial Hommiez system administrator:', created.rows[0]);
  console.log('The account is ACTIVE. Keep its email in SYSTEM_ADMIN_EMAILS on the Hommiez backend.');
};

setupSystemAdmin()
  .catch((error) => {
    console.error('System administrator setup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabasePools();
  });

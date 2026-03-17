import fs from 'fs';
import path from 'path';
import pool from '../config/database';

const runMultiTenantFoundationMigration = async () => {
  const client = await pool.connect();

  try {
    console.log('🚀 Running multi-tenant foundation migration...');

    await client.query('BEGIN');

    const sqlPath = path.join(process.cwd(), 'src/database/migrations/016_multi_tenant_foundation.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await client.query(sql);
    await client.query('COMMIT');

    const tenants = await client.query('SELECT id, tenant_name, tenant_slug, is_default, is_active FROM tenants ORDER BY id ASC');

    console.log('✅ Multi-tenant foundation migration completed.');
    console.log('📦 Tenants currently in database:');
    tenants.rows.forEach((tenant) => {
      console.log(`   - [${tenant.id}] ${tenant.tenant_name} (${tenant.tenant_slug}) | default=${tenant.is_default} | active=${tenant.is_active}`);
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Multi-tenant foundation migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

runMultiTenantFoundationMigration().catch(() => process.exit(1));

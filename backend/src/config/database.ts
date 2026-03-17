import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { getCurrentTenantId } from '../utils/tenantContext';

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 60000, // 60 seconds to tolerate Supabase cold starts
  statement_timeout: 30000, // 30 seconds for queries
  ssl: config.database.host.includes('supabase.com') 
    ? { rejectUnauthorized: false } // Enable SSL for Supabase
    : false, // Disable SSL for localhost
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

// Handle connection errors gracefully without crashing the server
pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  console.error('⚠️ Database connection lost. Pool will attempt to reconnect...');
  // Don't exit the process - let the pool handle reconnection
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const tenantId = getCurrentTenantId();
  const client = await pool.connect();

  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [String(tenantId)]);
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount, tenantId });
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    try {
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [String(config.tenancy.defaultTenantId)]);
    } catch (resetError) {
      console.error('Failed to reset tenant context for pooled client:', resetError);
    }
    client.release();
  }
};

export const getClient = async (): Promise<PoolClient> => {
  const tenantId = getCurrentTenantId();
  const client = await pool.connect();
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [String(tenantId)]);

  const originalRelease = client.release.bind(client);
  (client as any).release = (err?: Error | boolean) => {
    client
      .query("SELECT set_config('app.current_tenant_id', $1, false)", [String(config.tenancy.defaultTenantId)])
      .catch((resetError) => {
        console.error('Failed to reset tenant context on client release:', resetError);
      })
      .finally(() => {
        originalRelease(err as any);
      });
  };

  return client;
};

export default pool;

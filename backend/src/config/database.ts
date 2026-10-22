import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';
import { getCurrentTenantId } from '../utils/tenantContext';

const createPool = (database: typeof config.database, label: string) => {
  const pool = new Pool({
    host: database.host,
    port: database.port,
    database: database.name,
    user: database.user,
    password: database.password,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 60000,
    statement_timeout: 30000,
    ssl: database.host.includes('supabase.com')
      ? { rejectUnauthorized: false }
      : false,
  });

  pool.on('connect', () => console.log(`${label} database connection established`));
  pool.on('error', (err) => console.error(`${label} database pool error:`, err));
  return pool;
};

// APP_DATABASE_URL must use a non-owner, NOBYPASSRLS role in production.
const runtimePool = createPool(config.runtimeDatabase, 'Runtime');
// Reserved for migrations and controlled maintenance, never request handlers.
const migrationPool = createPool(config.migrationDatabase, 'Migration');

export const query = async (text: string, params?: any[]): Promise<QueryResult> => {
  const startedAt = Date.now();
  const tenantId = getCurrentTenantId();
  const client = await runtimePool.connect();

  try {
    // Supabase's transaction pooler may route each transaction to a different
    // server connection. Set the tenant GUC locally inside the same transaction
    // as the request query so RLS sees the intended tenant reliably.
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [String(tenantId)]);
    const result = await client.query(text, params);
    await client.query('COMMIT');

    console.log('Executed tenant query', {
      duration: Date.now() - startedAt,
      rows: result.rowCount,
      tenantId,
    });
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to rollback tenant query:', rollbackError);
    }
    console.error('Tenant database query error:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const migrationQuery = (text: string, params?: any[]) => migrationPool.query(text, params);

export const getClient = async (): Promise<PoolClient> => runtimePool.connect();
export const getMigrationClient = async (): Promise<PoolClient> => migrationPool.connect();

export const beginTenantTransaction = async (client: PoolClient): Promise<void> => {
  await client.query('BEGIN');
  await client.query(
    "SELECT set_config('app.current_tenant_id', $1, true)",
    [String(getCurrentTenantId())]
  );
};

// Default export remains the privileged pool for existing one-off migration
// scripts. HTTP request code must import `query` or `getClient` explicitly.
export default migrationPool;

export const closeDatabasePools = async (): Promise<void> => {
  await Promise.all([runtimePool.end(), migrationPool.end()]);
};

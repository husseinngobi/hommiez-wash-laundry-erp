import dotenv from 'dotenv';

dotenv.config();

const parsedDatabaseUrl = (() => {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;

  try {
    const url = new URL(raw);
    return {
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      name: (url.pathname || '/postgres').replace(/^\//, '') || 'postgres',
      user: decodeURIComponent(url.username || 'postgres'),
      password: decodeURIComponent(url.password || ''),
    };
  } catch (error) {
    console.warn('⚠️ Invalid DATABASE_URL. Falling back to DB_* variables.');
    return null;
  }
})();

const parseConnectionUrl = (raw: string | undefined) => {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return {
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      name: (url.pathname || '/postgres').replace(/^\//, '') || 'postgres',
      user: decodeURIComponent(url.username || 'postgres'),
      password: decodeURIComponent(url.password || ''),
    };
  } catch {
    return null;
  }
};

const databaseConfig = {
  host: parsedDatabaseUrl?.host || process.env.DB_HOST || 'localhost',
  port: parsedDatabaseUrl?.port || parseInt(process.env.DB_PORT || '5432', 10),
  name: parsedDatabaseUrl?.name || process.env.DB_NAME || 'postgres',
  user: parsedDatabaseUrl?.user || process.env.DB_USER || 'postgres',
  password: parsedDatabaseUrl?.password ?? (process.env.DB_PASSWORD || ''),
};

const parsedAppDatabaseUrl = parseConnectionUrl(process.env.APP_DATABASE_URL);
if (process.env.NODE_ENV === 'production' && !parsedAppDatabaseUrl) {
  throw new Error('APP_DATABASE_URL must be set in production to use the tenant-restricted runtime database role.');
}

const runtimeDatabaseConfig = parsedAppDatabaseUrl || databaseConfig;
const parsedMigrationDatabaseUrl = parseConnectionUrl(process.env.MIGRATION_DATABASE_URL);
const migrationDatabaseConfig = parsedMigrationDatabaseUrl || databaseConfig;
const deploymentTenantId = Number.parseInt(
  process.env.DEPLOYMENT_TENANT_ID || process.env.DEFAULT_TENANT_ID || '2',
  10
);
if (!Number.isInteger(deploymentTenantId) || deploymentTenantId <= 0) {
  throw new Error('DEPLOYMENT_TENANT_ID must be a positive integer.');
}

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  tenancy: {
    // Each independently deployed backend is pinned to one tenant. Client
    // headers and query parameters never select a tenant.
    deploymentTenantId,
  },
  
  database: databaseConfig,
  runtimeDatabase: runtimeDatabaseConfig,
  migrationDatabase: migrationDatabaseConfig,
  runStartupMigrations: (
    process.env.RUN_STARTUP_MIGRATIONS ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')
  ).toLowerCase() === 'true',
  
  jwt: {
    secret: (() => {
      const secret = process.env.JWT_SECRET;
      if (!secret || secret === 'change-this-secret-key') {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('JWT_SECRET must be set to a strong value in production (.env)');
        }
        console.warn('⚠️ JWT_SECRET is missing or using the insecure default. Set JWT_SECRET in .env');
        return secret || 'change-this-secret-key';
      }
      return secret;
    })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  cors: {
    // In production, use the configured frontend URL
    // In development, allow any origin for local network access
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.FRONTEND_URL || false
      : true, // Allow any origin in development
  },

  whatsapp: {
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
  },
};

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

const databaseConfig = {
  host: parsedDatabaseUrl?.host || process.env.DB_HOST || 'localhost',
  port: parsedDatabaseUrl?.port || parseInt(process.env.DB_PORT || '5432', 10),
  name: parsedDatabaseUrl?.name || process.env.DB_NAME || 'lush_laundry',
  user: parsedDatabaseUrl?.user || process.env.DB_USER || 'postgres',
  password: parsedDatabaseUrl?.password ?? (process.env.DB_PASSWORD || ''),
};

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  tenancy: {
    // Default tenant used when request-level override is absent.
    defaultTenantId: parseInt(process.env.DEFAULT_TENANT_ID || '1', 10),
    // When enabled, API clients can specify x-tenant-id or tenant_id.
    allowRequestOverride: (process.env.ALLOW_TENANT_OVERRIDE || 'false').toLowerCase() === 'true',
  },
  
  database: databaseConfig,
  
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

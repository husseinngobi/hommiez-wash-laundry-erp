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
  
  database: databaseConfig,
  
  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  cors: {
    // In production, use the configured frontend URL
    // In development, allow any origin for local network access
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.FRONTEND_URL || false
      : true, // Allow any origin in development
  },
};

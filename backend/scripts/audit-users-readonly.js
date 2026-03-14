const { Pool } = require('pg');

function buildDbConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    };
  }

  const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length > 0) {
    console.error(`Missing DB config. Set DATABASE_URL or these vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  };
}

const pool = new Pool(buildDbConfig());

function parseSystemAdmins() {
  const raw = process.env.SYSTEM_ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function run() {
  const client = await pool.connect();
  try {
    console.log('Running read-only user audit...');

    const users = await client.query(`
      SELECT id, email, full_name, role, status, created_at, last_login,
             CASE WHEN password IS NULL OR password = '' THEN false ELSE true END AS has_password
      FROM users
      WHERE deleted_at IS NULL OR deleted_at IS NOT DISTINCT FROM NULL
      ORDER BY created_at DESC
      LIMIT 200;
    `);

    const summary = await client.query(`
      SELECT
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_users,
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_users,
        COUNT(*) FILTER (WHERE role = 'ADMIN') AS admin_users,
        COUNT(*) FILTER (WHERE role = 'MANAGER') AS manager_users,
        COUNT(*) FILTER (WHERE role = 'DESKTOP_AGENT') AS desktop_agent_users
      FROM users
      WHERE deleted_at IS NULL OR deleted_at IS NOT DISTINCT FROM NULL;
    `);

    const systemAdminEmails = parseSystemAdmins();

    console.log('\n=== SUMMARY ===');
    console.table(summary.rows);

    console.log('\n=== USERS (top 200) ===');
    const rows = users.rows.map((u) => ({
      ...u,
      is_system_admin: systemAdminEmails.length > 0
        ? systemAdminEmails.includes(String(u.email).toLowerCase())
        : 'fallback-all-admins',
    }));
    console.table(rows);

    console.log('\nNote: This script is read-only and does not modify data.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});

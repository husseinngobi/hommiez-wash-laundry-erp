const requiredBackend = [
  'NODE_ENV',
  'PORT',
  'JWT_SECRET',
  'FRONTEND_URL',
  'SYSTEM_ADMIN_EMAILS',
];

const dbVars = ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

function mask(value) {
  if (!value) return '<missing>';
  if (value.length <= 6) return '***';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function run() {
  console.log('Read-only environment audit');

  const missingBackend = requiredBackend.filter((k) => !process.env[k]);
  const presentDb = dbVars.filter((k) => !!process.env[k]);

  console.log('\n=== REQUIRED BACKEND VARIABLES ===');
  requiredBackend.forEach((k) => {
    const isSecret = ['JWT_SECRET'].includes(k);
    const value = process.env[k] || '';
    console.log(`${k}: ${isSecret ? mask(value) : (value || '<missing>')}`);
  });

  console.log('\n=== DATABASE VARIABLES PRESENT ===');
  console.log(presentDb.join(', ') || '<none>');

  if (!process.env.DATABASE_URL && !['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].every((k) => !!process.env[k])) {
    console.log('\nWARNING: Database config incomplete. Set DATABASE_URL or all DB_* vars.');
  }

  if (missingBackend.length > 0) {
    console.log(`\nWARNING: Missing vars: ${missingBackend.join(', ')}`);
  }

  if ((process.env.JWT_SECRET || '').toLowerCase().includes('change') || (process.env.JWT_SECRET || '').length < 32) {
    console.log('\nWARNING: JWT_SECRET appears weak/default. Rotate before production.');
  }

  const frontend = process.env.FRONTEND_URL || '';
  if (!frontend.startsWith('https://')) {
    console.log('\nWARNING: FRONTEND_URL should use https in production.');
  }

  console.log('\nThis script is read-only and does not modify data.');
}

run();

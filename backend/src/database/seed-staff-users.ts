import { query } from '../config/database';
import bcrypt from 'bcryptjs';

/**
 * Seed Staff Users for Login Testing
 * Passwords come from .env (SEED_AGENT_PASSWORD / SEED_MANAGER_PASSWORD)
 */

interface StaffUser {
  name: string;
  email: string;
  password: string;
  role: 'DESKTOP_AGENT' | 'MANAGER' | 'ADMIN';
  phone?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in backend/.env (see .env.example)`);
  }
  return value;
}

async function seedStaffUsers() {
  try {
    const agentPassword = requireEnv('SEED_AGENT_PASSWORD');
    const managerPassword = requireEnv('SEED_MANAGER_PASSWORD');

    const staffUsers: StaffUser[] = [
      {
        name: 'John Mugisha',
        email: 'john.agent@lushlaundry.com',
        password: agentPassword,
        role: 'DESKTOP_AGENT',
        phone: '+256700123456',
      },
      {
        name: 'Sarah Nakato',
        email: 'sarah.agent@lushlaundry.com',
        password: agentPassword,
        role: 'DESKTOP_AGENT',
        phone: '+256700123457',
      },
      {
        name: 'David Okello',
        email: 'david.manager@lushlaundry.com',
        password: managerPassword,
        role: 'MANAGER',
        phone: '+256700123458',
      },
      {
        name: 'Grace Atim',
        email: 'grace.manager@lushlaundry.com',
        password: managerPassword,
        role: 'MANAGER',
        phone: '+256700123459',
      },
      {
        name: 'Peter Musoke',
        email: 'peter.agent@lushlaundry.com',
        password: agentPassword,
        role: 'DESKTOP_AGENT',
        phone: '+256700123460',
      },
    ];

    console.log('👥 Starting to seed staff users...\n');

    let created = 0;
    let skipped = 0;

    for (const user of staffUsers) {
      const existing = await query('SELECT id FROM users WHERE email = $1', [user.email]);
      if (existing.rows.length > 0) {
        console.log(`⏭️  Skipped (exists): ${user.email}`);
        skipped++;
        continue;
      }

      const hashed = await bcrypt.hash(user.password, 10);
      await query(
        `INSERT INTO users (email, password, full_name, phone, role, status, auth_provider)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'EMAIL')`,
        [user.email, hashed, user.name, user.phone || null, user.role]
      );
      console.log(`✅ Created: ${user.email} (${user.role})`);
      created++;
    }

    console.log(`\nDone. Created ${created}, skipped ${skipped}.`);
    console.log('Passwords are taken from SEED_AGENT_PASSWORD / SEED_MANAGER_PASSWORD in .env');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed staff users:', error);
    process.exit(1);
  }
}

seedStaffUsers();

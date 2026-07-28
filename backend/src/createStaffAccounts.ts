import { query } from './config/database';
import bcrypt from 'bcryptjs';

async function createStaffAccounts() {
  try {
    console.log('\n🔧 Creating staff accounts...\n');

    const managerPlain = process.env.SEED_MANAGER_PASSWORD;
    const cashierPlain = process.env.SEED_CASHIER_PASSWORD || process.env.SEED_AGENT_PASSWORD;
    if (!managerPlain || !cashierPlain) {
      throw new Error('Set SEED_MANAGER_PASSWORD and SEED_CASHIER_PASSWORD (or SEED_AGENT_PASSWORD) in .env');
    }

    const managerPassword = await bcrypt.hash(managerPlain, 10);
    const cashierPassword = await bcrypt.hash(cashierPlain, 10);

    try {
      const managerResult = await query(
        `INSERT INTO users (email, password, full_name, phone, role, status, auth_provider, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING id, email, full_name, role`,
        [
          process.env.SEED_MANAGER_EMAIL || 'manager@lushlaundry.com',
          managerPassword,
          'Laundry Manager',
          '+256 700 111 111',
          'MANAGER',
          'ACTIVE',
          'LOCAL',
        ]
      );
      console.log('✅ Manager account created:', managerResult.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') {
        console.log('⚠️  Manager account already exists');
      } else {
        throw error;
      }
    }

    try {
      const cashierResult = await query(
        `INSERT INTO users (email, password, full_name, phone, role, status, auth_provider, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING id, email, full_name, role`,
        [
          process.env.SEED_CASHIER_EMAIL || 'cashier@lushlaundry.com',
          cashierPassword,
          'Front Desk Cashier',
          '+256 700 222 222',
          'DESKTOP_AGENT',
          'ACTIVE',
          'LOCAL',
        ]
      );
      console.log('✅ Cashier account created:', cashierResult.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') {
        console.log('⚠️  Cashier account already exists');
      } else {
        throw error;
      }
    }

    console.log('\n✅ Done. Passwords are only in your .env (SEED_* variables).');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating staff accounts:', error);
    process.exit(1);
  }
}

createStaffAccounts();

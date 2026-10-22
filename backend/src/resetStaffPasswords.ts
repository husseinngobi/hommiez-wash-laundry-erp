import { query } from './config/database';
import bcrypt from 'bcryptjs';

async function resetPasswords() {
  try {
    console.log('\n🔄 Resetting staff passwords...\n');

    const managerPlain = process.env.SEED_MANAGER_PASSWORD;
    const cashierPlain = process.env.SEED_CASHIER_PASSWORD || process.env.SEED_AGENT_PASSWORD;
    if (!managerPlain || !cashierPlain) {
      throw new Error('Set SEED_MANAGER_PASSWORD and SEED_CASHIER_PASSWORD (or SEED_AGENT_PASSWORD) in .env');
    }

    const managerPassword = await bcrypt.hash(managerPlain, 10);
    const cashierPassword = await bcrypt.hash(cashierPlain, 10);

    await query(
      `UPDATE users 
       SET password = $1, updated_at = NOW()
       WHERE email = $2 AND auth_provider = 'LOCAL'`,
      [managerPassword, process.env.SEED_MANAGER_EMAIL || 'manager@hommiezwash.com']
    );
    console.log('✅ Manager password reset');

    await query(
      `UPDATE users 
       SET password = $1, updated_at = NOW()
       WHERE email = $2 AND auth_provider = 'LOCAL'`,
      [cashierPassword, process.env.SEED_CASHIER_EMAIL || 'cashier@hommiezwash.com']
    );
    console.log('✅ Cashier password reset');

    console.log('\nPasswords updated from SEED_* values in .env (not printed).');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetPasswords();

import { query } from './config/database';
import bcrypt from 'bcryptjs';

async function createManagerAccount() {
  try {
    const plainPassword = process.env.SEED_MANAGER_PASSWORD;
    if (!plainPassword) {
      throw new Error('Set SEED_MANAGER_PASSWORD in backend/.env (see .env.example)');
    }

    const email = process.env.SEED_MANAGER_EMAIL || 'manager@lushlaundry.com';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const result = await query(
      `INSERT INTO users (email, password, full_name, phone, role, status, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, email, full_name, phone, role, status`,
      [email, hashedPassword, 'Test Manager', '+256700000000', 'MANAGER', 'ACTIVE']
    );

    console.log('✅ Manager account created successfully:');
    console.log(result.rows[0]);
    console.log(`\n📧 Email: ${email}`);
    console.log('🔑 Password: (from SEED_MANAGER_PASSWORD in .env)');

    process.exit(0);
  } catch (error: any) {
    if (error.message && error.message.includes('duplicate key')) {
      console.log('⚠️  Manager account already exists');
      console.log(`📧 Email: ${process.env.SEED_MANAGER_EMAIL || 'manager@lushlaundry.com'}`);
      console.log('🔑 Password: (from SEED_MANAGER_PASSWORD in .env)');
      process.exit(0);
    } else {
      console.error('❌ Error creating manager account:', error);
      process.exit(1);
    }
  }
}

createManagerAccount();

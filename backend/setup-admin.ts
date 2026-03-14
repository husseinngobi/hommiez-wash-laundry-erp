/**
 * Setup Admin User Script
 * 
 * This script:
 * 1. Adds missing columns to the users table in Supabase
 * 2. Creates the initial admin user
 * 
 * Run with: npx ts-node setup-admin.ts
 */

import { query } from './src/config/database';
import bcrypt from 'bcryptjs';

async function setupAdmin() {
  try {
    const adminEmail = process.env.SETUP_ADMIN_EMAIL || 'husseinibram555@gmail.com';
    const adminPassword = process.env.SETUP_ADMIN_PASSWORD;
    const adminFullName = process.env.SETUP_ADMIN_FULL_NAME || 'Hussein Ngobi';
    const adminPhone = process.env.SETUP_ADMIN_PHONE || '+256XXXXXXXXXX';

    if (!adminPassword || adminPassword.length < 8) {
      throw new Error('SETUP_ADMIN_PASSWORD is required and must be at least 8 characters');
    }

    console.log('🔧 Step 1: Adding missing columns to users table...');
    
    // Add all missing columns that the application code expects
    await query(`
      ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'LOCAL',
        ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE,
        ADD COLUMN IF NOT EXISTS google_photo VARCHAR(500),
        ADD COLUMN IF NOT EXISTS last_login TIMESTAMP,
        ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS session_timeout_minutes INTEGER DEFAULT 15,
        ADD COLUMN IF NOT EXISTS profile_picture VARCHAR(500),
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
        ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS rejected_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    `);
    
    console.log('✅ Users table schema updated successfully!');
    console.log('');
    
    console.log('👤 Step 2: Creating admin user...');
    
    // Hash the password securely
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Insert or update admin user
    await query(`
      INSERT INTO users (
        email, 
        password, 
        full_name, 
        phone, 
        role, 
        status, 
        auth_provider, 
        is_active, 
        session_timeout_minutes,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (email) 
      DO UPDATE SET 
        password = EXCLUDED.password,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        is_active = EXCLUDED.is_active,
        updated_at = NOW();
    `, [
      adminEmail,
      hashedPassword,
      adminFullName,
      adminPhone,
      'ADMIN',
      'ACTIVE',
      'LOCAL',
      true,
      15
    ]);
    
    console.log('✅ Admin user created successfully!');
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('📋 LOGIN CREDENTIALS');
    console.log('═══════════════════════════════════════');
    console.log(`📧 Email:    ${adminEmail}`);
    console.log('🔑 Password: (from SETUP_ADMIN_PASSWORD env var)');
    console.log('👔 Role:     ADMIN');
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('✅ Setup complete! You can now:');
    console.log('   1. Start backend: npm run dev');
    console.log('   2. Login with your credentials');
    console.log('   3. Create other users through the system UI');
    console.log('');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Setup failed:', error.message);
    console.error('');
    console.error('Common issues:');
    console.error('  • Check backend/.env has correct Supabase credentials');
    console.error('  • Verify database connection is working');
    console.error('  • Ensure users table exists');
    console.error('');
    process.exit(1);
  }
}

setupAdmin();

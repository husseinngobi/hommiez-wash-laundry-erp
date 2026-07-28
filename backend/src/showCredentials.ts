import { query } from './config/database';

async function showLoginCredentials() {
  try {
    console.log('\n📋 LUSH LAUNDRY - LOGIN CREDENTIALS\n');
    console.log('='.repeat(60));
    
    // Get all active users
    const result = await query(
      `SELECT id, email, full_name, role, status, auth_provider 
       FROM users 
       WHERE status = 'ACTIVE' AND auth_provider = 'EMAIL'
       ORDER BY 
         CASE role 
           WHEN 'ADMIN' THEN 1 
           WHEN 'MANAGER' THEN 2 
           WHEN 'DESKTOP_AGENT' THEN 3 
           WHEN 'USER' THEN 4 
         END, 
         created_at`
    );
    
    if (result.rows.length === 0) {
      console.log('❌ No active email/password users found in database!');
      console.log('\n💡 Run these commands to create test accounts:');
      console.log('   npm run create:manager    # Creates manager account');
      console.log('   npm run seed             # Creates admin and test users');
      process.exit(1);
    }
    
    console.log(`\n✅ Found ${result.rows.length} active user(s):\n`);
    
    for (const user of result.rows) {
      let roleIcon = '';
      
      switch (user.role) {
        case 'ADMIN':
          roleIcon = '👑';
          break;
        case 'MANAGER':
          roleIcon = '📊';
          break;
        case 'DESKTOP_AGENT':
          roleIcon = '💼';
          break;
        case 'USER':
          roleIcon = '👤';
          break;
      }
      
      console.log(`${roleIcon} ${user.role}`);
      console.log(`   Name:     ${user.full_name}`);
      console.log(`   Email:    ${user.email}`);
      console.log(`   Password: (from SEED_* / create scripts in .env — not stored in source)`);
      console.log(`   Status:   ${user.status}`);
      console.log('');
    }
    
    console.log('='.repeat(60));
    console.log('\n💡 NOTES:');
    console.log('   • These are the DEFAULT passwords from seed scripts');
    console.log('   • If passwords were changed, use the new passwords');
    console.log('   • Google OAuth users login via "Sign in with Google"');
    console.log('   • Pending users cannot login until approved by admin\n');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

showLoginCredentials();

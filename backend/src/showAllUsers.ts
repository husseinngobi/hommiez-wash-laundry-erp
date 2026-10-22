import { query } from './config/database';

async function showAllUsers() {
  try {
    console.log('\n📊 HOMMIEZ WASH LAUNDRY AND DRY CLEANERS - USER AUDIT\n');
    console.log('='.repeat(80));
    
    // Get all users with their relationships
    const usersResult = await query(`
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.status,
        u.auth_provider,
        u.profile_picture,
        u.created_at,
        u.last_login,
        COUNT(DISTINCT o.id) as orders_count,
        COUNT(DISTINCT al.id) as activity_logs_count,
        COUNT(DISTINCT sal.id) as security_logs_count,
        COUNT(DISTINCT cu.id) as created_users_count
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      LEFT JOIN activity_logs al ON al.user_id = u.id
      LEFT JOIN security_audit_logs sal ON sal.user_id = u.id
      LEFT JOIN users cu ON cu.created_by = u.id
      GROUP BY u.id, u.email, u.full_name, u.role, u.status, u.auth_provider, 
               u.profile_picture, u.created_at, u.last_login
      ORDER BY 
        CASE u.status 
          WHEN 'ACTIVE' THEN 1 
          WHEN 'PENDING' THEN 2 
          WHEN 'SUSPENDED' THEN 3 
          ELSE 4 
        END,
        CASE u.role 
          WHEN 'ADMIN' THEN 1 
          WHEN 'MANAGER' THEN 2 
          WHEN 'DESKTOP_AGENT' THEN 3 
          WHEN 'USER' THEN 4 
        END,
        u.created_at
    `);
    
    if (usersResult.rows.length === 0) {
      console.log('❌ No users found in database!');
      process.exit(1);
    }
    
    console.log(`\n✅ Found ${usersResult.rows.length} user(s) in the system:\n`);
    
    // Group by status
    const activeUsers = usersResult.rows.filter(u => u.status === 'ACTIVE');
    const pendingUsers = usersResult.rows.filter(u => u.status === 'PENDING');
    const suspendedUsers = usersResult.rows.filter(u => u.status === 'SUSPENDED');
    const otherUsers = usersResult.rows.filter(u => !['ACTIVE', 'PENDING', 'SUSPENDED'].includes(u.status));
    
    // Show ACTIVE users
    if (activeUsers.length > 0) {
      console.log('🟢 ACTIVE USERS (' + activeUsers.length + ')');
      console.log('-'.repeat(80));
      for (const user of activeUsers) {
        const roleIcon = user.role === 'ADMIN' ? '👑' : 
                        user.role === 'MANAGER' ? '📊' : 
                        user.role === 'DESKTOP_AGENT' ? '💼' : '👤';
        const authIcon = user.auth_provider === 'GOOGLE' ? '🔗 Google' : 
                        user.auth_provider === 'DUAL' ? '🔗🔐 Google + Password' :
                        user.auth_provider === 'LOCAL' ? '🔐 Email/Password' : '🔐 Email/Password';
        
        const canDelete = 
          parseInt(user.orders_count) === 0 && 
          parseInt(user.created_users_count) === 0;
        
        console.log(`\n${roleIcon} ${user.role} - ${user.full_name}`);
        console.log(`   ID:           #${user.id}`);
        console.log(`   Email:        ${user.email}`);
        console.log(`   Auth:         ${authIcon}`);
        console.log(`   Created:      ${new Date(user.created_at).toLocaleDateString()}`);
        console.log(`   Last Login:   ${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}`);
        console.log(`   Profile Pic:  ${user.profile_picture || 'Not set'}`);
        console.log(`\n   📊 Data Relationships:`);
        console.log(`      Orders Created:      ${user.orders_count}`);
        console.log(`      Users Created:       ${user.created_users_count}`);
        console.log(`      Activity Logs:       ${user.activity_logs_count}`);
        console.log(`      Security Logs:       ${user.security_logs_count}`);
        console.log(`\n   ${canDelete ? '✅ CAN BE DELETED (no dependencies)' : '🔒 CANNOT DELETE - Has data relationships (suspend only)'}`);
      }
      console.log('\n' + '-'.repeat(80) + '\n');
    }
    
    // Show SUSPENDED users
    if (suspendedUsers.length > 0) {
      console.log('🔴 SUSPENDED USERS (' + suspendedUsers.length + ')');
      console.log('-'.repeat(80));
      for (const user of suspendedUsers) {
        const roleIcon = user.role === 'ADMIN' ? '👑' : 
                        user.role === 'MANAGER' ? '📊' : 
                        user.role === 'DESKTOP_AGENT' ? '💼' : '👤';
        const authIcon = user.auth_provider === 'GOOGLE' ? '🔗 Google' : 
                        user.auth_provider === 'DUAL' ? '🔗🔐 Google + Password' :
                        '🔐 Email/Password';
        
        const canDelete = 
          parseInt(user.orders_count) === 0 && 
          parseInt(user.created_users_count) === 0;
        
        console.log(`\n${roleIcon} ${user.role} - ${user.full_name}`);
        console.log(`   ID:           #${user.id}`);
        console.log(`   Email:        ${user.email}`);
        console.log(`   Auth:         ${authIcon}`);
        console.log(`   Created:      ${new Date(user.created_at).toLocaleDateString()}`);
        console.log(`   Last Login:   ${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}`);
        console.log(`\n   📊 Data Relationships:`);
        console.log(`      Orders Created:      ${user.orders_count}`);
        console.log(`      Users Created:       ${user.created_users_count}`);
        console.log(`      Activity Logs:       ${user.activity_logs_count}`);
        console.log(`      Security Logs:       ${user.security_logs_count}`);
        console.log(`\n   ⚠️  SUSPENDED - Cannot login but data preserved`);
        console.log(`   ${canDelete ? '✅ Could be deleted if reactivated' : '🔒 Has data - must remain in system'}`);
      }
      console.log('\n' + '-'.repeat(80) + '\n');
    }
    
    // Show PENDING users
    if (pendingUsers.length > 0) {
      console.log('🟡 PENDING APPROVAL (' + pendingUsers.length + ')');
      console.log('-'.repeat(80));
      for (const user of pendingUsers) {
        console.log(`\n👤 ${user.role} - ${user.full_name}`);
        console.log(`   ID:       #${user.id}`);
        console.log(`   Email:    ${user.email}`);
        console.log(`   Created:  ${new Date(user.created_at).toLocaleDateString()}`);
        console.log(`   ⏳ Awaiting admin approval`);
      }
      console.log('\n' + '-'.repeat(80) + '\n');
    }
    
    // Show OTHER users
    if (otherUsers.length > 0) {
      console.log('⚫ OTHER STATUS USERS (' + otherUsers.length + ')');
      console.log('-'.repeat(80));
      for (const user of otherUsers) {
        console.log(`\n👤 ${user.role} - ${user.full_name}`);
        console.log(`   ID:       #${user.id}`);
        console.log(`   Email:    ${user.email}`);
        console.log(`   Status:   ${user.status}`);
        console.log(`   Created:  ${new Date(user.created_at).toLocaleDateString()}`);
      }
      console.log('\n' + '-'.repeat(80) + '\n');
    }
    
    // Summary
    console.log('📋 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Users:        ${usersResult.rows.length}`);
    console.log(`Active:             ${activeUsers.length} (can login)`);
    console.log(`Suspended:          ${suspendedUsers.length} (cannot login, data preserved)`);
    console.log(`Pending Approval:   ${pendingUsers.length} (awaiting activation)`);
    console.log(`Other:              ${otherUsers.length}`);
    
    // Deletion policy
    console.log('\n🔒 DELETION POLICY');
    console.log('='.repeat(80));
    console.log('Users with ANY of the following CANNOT be deleted:');
    console.log('  • Orders created by them');
    console.log('  • Other users they created');
    console.log('  • Active sessions or security logs');
    console.log('\n✅ Alternative: SUSPEND users instead of deleting');
    console.log('   - Preserves all data relationships');
    console.log('   - Prevents login while maintaining audit trail');
    console.log('   - Can be reactivated if needed\n');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

showAllUsers();

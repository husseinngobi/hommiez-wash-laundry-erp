import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'hommiez_wash',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
});

async function runMigrations() {
  try {
    console.log('🔄 Running notifications system migrations...\n');

    // Read and run notifications table migration
    const notificationsSql = await fs.readFile(
      path.join(__dirname, 'migrations', 'create_notifications_table.sql'),
      'utf-8'
    );
    await pool.query(notificationsSql);
    console.log('✅ Notifications table created');

    // Read and run user_preferences table migration
    const preferencesSql = await fs.readFile(
      path.join(__dirname, 'migrations', 'create_user_preferences_table.sql'),
      'utf-8'
    );
    await pool.query(preferencesSql);
    console.log('✅ User preferences table created');

    // Check if sender_id column needs to be added to notifications
    const checkSenderColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='notifications' AND column_name='sender_id'
    `);

    if (checkSenderColumn.rows.length === 0) {
      await pool.query(`
        ALTER TABLE notifications 
        ADD COLUMN sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      `);
      console.log('✅ Added sender_id column to notifications table');
    }

    console.log('\n✅ All migrations completed successfully!');
    console.log('\n📊 Database status:');
    
    // Show table counts
    const notifCount = await pool.query('SELECT COUNT(*) FROM notifications');
    const prefCount = await pool.query('SELECT COUNT(*) FROM user_preferences');
    
    console.log(`   - Notifications: ${notifCount.rows[0].count}`);
    console.log(`   - User Preferences: ${prefCount.rows[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();

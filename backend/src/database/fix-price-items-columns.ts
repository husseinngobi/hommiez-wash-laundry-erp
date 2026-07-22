import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

async function checkMissingColumns() {
  try {
    console.log('🔍 Checking for missing columns in price_items table...\n');

    // Get current columns
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'price_items'
      ORDER BY ordinal_position
    `);

    const existingColumns = result.rows.map(r => r.column_name);
    console.log('📋 Current columns:', existingColumns.join(', '));

    // Required columns for discount functionality
    const requiredColumns = [
      'discount_percentage',
      'discount_start_date',
      'discount_end_date',
      'unit'
    ];

    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      console.log('\n❌ Missing columns:', missingColumns.join(', '));
      console.log('\n🔧 Adding missing columns...\n');

      // Add discount_percentage
      if (missingColumns.includes('discount_percentage')) {
        await pool.query(`
          ALTER TABLE price_items 
          ADD COLUMN discount_percentage DECIMAL(5,2) DEFAULT 0
        `);
        console.log('✅ Added discount_percentage column');
      }

      // Add discount_start_date
      if (missingColumns.includes('discount_start_date')) {
        await pool.query(`
          ALTER TABLE price_items 
          ADD COLUMN discount_start_date TIMESTAMP
        `);
        console.log('✅ Added discount_start_date column');
      }

      // Add discount_end_date
      if (missingColumns.includes('discount_end_date')) {
        await pool.query(`
          ALTER TABLE price_items 
          ADD COLUMN discount_end_date TIMESTAMP
        `);
        console.log('✅ Added discount_end_date column');
      }

      if (missingColumns.includes('unit')) {
        await pool.query(`
          ALTER TABLE price_items 
          ADD COLUMN unit VARCHAR(20) NOT NULL DEFAULT 'piece'
        `);
        await pool.query(`
          UPDATE price_items SET unit = 'piece' WHERE unit IS NULL
        `);
        console.log('✅ Added unit column');
      }

      console.log('\n✅ All missing columns added!');
    } else {
      console.log('\n✅ All required columns exist!');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkMissingColumns();

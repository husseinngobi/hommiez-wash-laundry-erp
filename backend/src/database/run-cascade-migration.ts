import { getMigrationClient } from '../config/database';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  const client = await getMigrationClient();
  
  try {
    console.log('Running CASCADE delete migration...');
    
    const sqlPath = path.join(__dirname, 'add-cascade-delete.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('✅ Foreign key constraints updated with CASCADE delete');
    console.log('✅ Deleting customers will now also delete their orders');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    process.exit(0);
  }
}

runMigration();

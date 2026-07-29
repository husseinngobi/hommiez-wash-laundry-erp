import pool from '../config/database';
import { ensureOrderItemServiceTypes } from './ensureOrderItemServiceTypes';

const run = async () => {
  try {
    console.log('🚀 Updating order_items service_type constraint...');
    await ensureOrderItemServiceTypes();
    console.log('🎉 Done. Orders can use WASH, IRON, and EXPRESS.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

run();

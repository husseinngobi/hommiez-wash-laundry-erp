import pool from '../config/database';
import { backfillMissingPaymentTransactions } from './backfillMissingPayments';

const run = async () => {
  try {
    console.log('🚀 Backfilling missing payment transactions...');
    await backfillMissingPaymentTransactions();
    console.log('🎉 Done.');
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

run();

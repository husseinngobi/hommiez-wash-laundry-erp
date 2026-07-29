import { query } from '../config/database';

/**
 * Production DBs created before express-service migration only allow lowercase wash/iron.
 * The app stores WASH | IRON | EXPRESS — this constraint must match.
 */
export async function ensureOrderItemServiceTypes(): Promise<void> {
  await query(`
    ALTER TABLE order_items
    DROP CONSTRAINT IF EXISTS order_items_service_type_check
  `);

  await query(`
    ALTER TABLE order_items
    ADD CONSTRAINT order_items_service_type_check
    CHECK (service_type IN ('wash', 'iron', 'express', 'WASH', 'IRON', 'EXPRESS'))
  `);

  console.log('✅ order_items service_type constraint updated (WASH/IRON/EXPRESS)');
}

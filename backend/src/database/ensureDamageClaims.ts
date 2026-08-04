import { query } from '../config/database';

/**
 * Creates the damage_claims table for logging customer complaints about
 * damaged or lost items linked to specific orders.
 * When a claim is created, it optionally creates an expense record.
 */
export async function ensureDamageClaims(): Promise<void> {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS damage_claims (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        order_number VARCHAR(50),
        customer_name VARCHAR(255),
        item_description TEXT NOT NULL,
        claim_type VARCHAR(20) NOT NULL DEFAULT 'DAMAGED'
          CHECK (claim_type IN ('DAMAGED', 'LOST', 'STAINED', 'SHRUNK', 'OTHER')),
        description TEXT,
        compensation_amount INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
          CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
        resolution_notes TEXT,
        logged_by INTEGER REFERENCES users(id),
        resolved_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ ensureDamageClaims: damage_claims table ready');
  } catch (err) {
    console.error('⚠️ ensureDamageClaims migration error:', err);
  }
}

/**
 * Upsert household cover / net items with wash price,
 * ironing = half wash, express = auto (2x wash via NULL express_price).
 *
 * Run: npx ts-node src/database/seed-household-covers.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import pool from '../config/database';

dotenv.config({ path: path.join(__dirname, '../../.env') });

type SeedItem = {
  name: string;
  category: string;
  subcategory: string;
  unit: string;
  price: number;
};

const items: SeedItem[] = [
  { name: 'Armrest Covers', category: 'general', subcategory: 'Furniture Covers', unit: 'piece', price: 2000 },
  { name: 'Back and Seat Covers', category: 'general', subcategory: 'Furniture Covers', unit: 'piece', price: 2500 },
  { name: 'Mosquito Net (Big)', category: 'general', subcategory: 'Bedding', unit: 'piece', price: 3500 },
  { name: 'Mosquito Net (Medium)', category: 'general', subcategory: 'Bedding', unit: 'piece', price: 2500 },
  // User listed: small 15000/=, smallest 8000/=
  { name: 'Mosquito Net (Small)', category: 'general', subcategory: 'Bedding', unit: 'piece', price: 15000 },
  { name: 'Mosquito Net (Smallest)', category: 'general', subcategory: 'Bedding', unit: 'piece', price: 8000 },
  { name: 'Bed Cover (15,000)', category: 'general', subcategory: 'Bedding', unit: 'piece', price: 15000 },
  { name: 'Bed Cover (20,000)', category: 'general', subcategory: 'Bedding', unit: 'piece', price: 20000 },
  { name: 'Bed Cover (25,000)', category: 'general', subcategory: 'Bedding', unit: 'piece', price: 25000 },
  { name: 'Bed Cover (30,000)', category: 'general', subcategory: 'Bedding', unit: 'piece', price: 30000 },
  { name: 'Bed Cover (35,000)', category: 'general', subcategory: 'Bedding', unit: 'piece', price: 35000 },
  { name: 'Bed Cover (40,000)', category: 'general', subcategory: 'Bedding', unit: 'piece', price: 40000 },
  { name: 'Bed Cover (45,000)', category: 'general', subcategory: 'Bedding', unit: 'piece', price: 45000 },
];

function getNextItemId(prefix: string, existingIds: Set<string>): string {
  let max = 0;
  for (const id of existingIds) {
    const match = id.match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${max + 1}`;
}

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding household covers / nets into price_items...');
    await client.query('BEGIN');

    const existingResult = await client.query('SELECT id, item_id, name FROM price_items');
    const existingIds = new Set<string>(existingResult.rows.map((r: any) => String(r.item_id)));
    const byName = new Map<string, { id: number; item_id: string }>(
      existingResult.rows.map((r: any) => [String(r.name).toLowerCase(), { id: r.id, item_id: r.item_id }])
    );

    let inserted = 0;
    let updated = 0;

    for (const item of items) {
      const ironing = Math.round(item.price / 2);
      const existing = byName.get(item.name.toLowerCase());

      if (existing) {
        await client.query(
          `UPDATE price_items
           SET price = $1,
               ironing_price = $2,
               express_price = NULL,
               category = $3,
               subcategory = $4,
               unit = $5,
               is_active = TRUE,
               updated_at = NOW()
           WHERE id = $6`,
          [item.price, ironing, item.category, item.subcategory, item.unit, existing.id]
        );
        updated++;
        console.log(`  Updated: ${item.name} → wash ${item.price}, iron ${ironing}, express auto 2x`);
      } else {
        const itemId = getNextItemId('h', existingIds);
        existingIds.add(itemId);
        await client.query(
          `INSERT INTO price_items (
            item_id, name, category, subcategory, unit, price, ironing_price, express_price, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, TRUE)`,
          [itemId, item.name, item.category, item.subcategory, item.unit, item.price, ironing]
        );
        inserted++;
        console.log(`  Inserted: ${itemId} ${item.name} → wash ${item.price}, iron ${ironing}, express auto 2x`);
      }
    }

    await client.query('COMMIT');
    console.log(`Done. Inserted ${inserted}, updated ${updated}.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

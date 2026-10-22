import pool from '../config/database';

type CatalogItem = {
  item_id?: string;
  name: string;
  category: 'gents' | 'ladies' | 'general' | 'kids' | 'home_services';
  subcategory?: string;
  unit?: 'piece' | 'kg';
  price: number;
  ironing_price: number;
};

const catalogItems: CatalogItem[] = [
  // Gents
  { item_id: 'g1', name: '2 pc suit', category: 'gents', price: 17000, ironing_price: 8500 },
  { item_id: 'g2', name: '3 pc suit', category: 'gents', price: 18000, ironing_price: 9000 },
  { item_id: 'g3', name: 'Trousers', category: 'gents', price: 7000, ironing_price: 3500 },
  { item_id: 'g4', name: 'Jeans', category: 'gents', price: 6000, ironing_price: 3000 },
  { item_id: 'g5', name: 'Linen', category: 'gents', price: 7000, ironing_price: 3500 },
  { item_id: 'g6', name: 'Blazer and coat', category: 'gents', price: 11000, ironing_price: 5500 },
  { item_id: 'g7', name: 'French coats', category: 'gents', price: 12000, ironing_price: 6000 },
  { item_id: 'g11', name: 'Colored Shirts', category: 'gents', price: 6000, ironing_price: 3000 },
  { item_id: 'g12', name: 'White shirts', category: 'gents', price: 7000, ironing_price: 3500 },
  { item_id: 'g14', name: 'T. shirts', category: 'gents', price: 5000, ironing_price: 2500 },
  { item_id: 'g15', name: 'Vests', category: 'gents', price: 3000, ironing_price: 1500 },
  { item_id: 'g18', name: 'Jackets / jampers', category: 'gents', price: 10000, ironing_price: 5000 },
  { name: 'Waist coats', category: 'gents', price: 5000, ironing_price: 2500 },
  { name: 'Bishop gowns', category: 'gents', price: 21000, ironing_price: 10500 },
  { name: 'Hats', category: 'gents', price: 5000, ironing_price: 2500 },
  { name: 'Socks / hankies', category: 'gents', price: 2000, ironing_price: 1000 },
  { name: 'khaki', category: 'gents', price: 8000, ironing_price: 4000 },

  // Ladies
  { item_id: 'l1', name: 'Office suit', category: 'ladies', subcategory: 'Formal', price: 15000, ironing_price: 7500 },
  { item_id: 'l2', name: 'Full traditional wear', category: 'ladies', subcategory: 'Traditional', price: 21000, ironing_price: 10500 },
  { item_id: 'l3', name: 'Long dresses', category: 'ladies', subcategory: 'Dresses', price: 15000, ironing_price: 7500 },
  { item_id: 'l4', name: 'Short dresess', category: 'ladies', subcategory: 'Dresses', price: 10000, ironing_price: 5000 },
  { item_id: 'l5', name: 'Party dresses with tones', category: 'ladies', subcategory: 'Dresses', price: 20000, ironing_price: 10000 },
  { item_id: 'l11', name: '2 pc traditional wear', category: 'ladies', subcategory: 'Traditional', price: 15000, ironing_price: 7500 },
  { item_id: 'l19', name: 'Indian wear', category: 'ladies', subcategory: 'Traditional', price: 20000, ironing_price: 10000 },
  { name: 'Silk linen gown/ dress', category: 'ladies', subcategory: 'Dresses', price: 13500, ironing_price: 6750 },
  { name: 'Bitenge dress', category: 'ladies', subcategory: 'Dresses', price: 10000, ironing_price: 5000 },
  { name: 'Hats', category: 'ladies', subcategory: 'Accessories', price: 5500, ironing_price: 2750 },

  // Bedding & towels
  { item_id: 'h8', name: 'Bed sheets pair', category: 'general', subcategory: 'Bedding', price: 13000, ironing_price: 6500 },
  { item_id: 'h10', name: 'Bath robes', category: 'general', subcategory: 'Bathroom', price: 10500, ironing_price: 5250 },
  { item_id: 'h11', name: 'Towels', category: 'general', subcategory: 'Bathroom', price: 8500, ironing_price: 4250 },
  { item_id: 'h17', name: 'Heavy curtains per kg', category: 'general', subcategory: 'Curtains', unit: 'kg', price: 10000, ironing_price: 5000 },
  { item_id: 'h18', name: 'Light curtains per kg', category: 'general', subcategory: 'Curtains', unit: 'kg', price: 8000, ironing_price: 4000 },
  { item_id: 'h22', name: 'Pillows', category: 'general', subcategory: 'Bedding', price: 12000, ironing_price: 6000 },
  { item_id: 'h24', name: 'Mosquito nets', category: 'general', subcategory: 'Bedding', price: 10000, ironing_price: 5000 },
  { item_id: 'h25', name: 'Pillow cases + pillow', category: 'general', subcategory: 'Bedding', price: 7500, ironing_price: 3750 },
  { name: 'Duvet and blankets per kg', category: 'general', subcategory: 'Bedding', unit: 'kg', price: 9000, ironing_price: 4500 },
  { name: 'Throw blankets', category: 'general', subcategory: 'Bedding', price: 8000, ironing_price: 4000 },

  // Household items
  { name: 'Sofa covers per kg', category: 'general', subcategory: 'Household', unit: 'kg', price: 9000, ironing_price: 4500 },
  { name: 'Table cloth', category: 'general', subcategory: 'Household', price: 9000, ironing_price: 4500 },
  { name: 'Teddy bears', category: 'general', subcategory: 'Household', price: 16500, ironing_price: 8250 },
  { name: 'Lamp sheds', category: 'general', subcategory: 'Household', price: 5000, ironing_price: 2500 },
  { name: 'Door rugs', category: 'general', subcategory: 'Household', price: 15000, ironing_price: 7500 },
  { name: 'Shoes', category: 'general', subcategory: 'Household', price: 8000, ironing_price: 4000 },
];

const prefixByCategory: Record<CatalogItem['category'], string> = {
  gents: 'g',
  ladies: 'l',
  general: 'h',
  kids: 'k',
  home_services: 'h',
};

function getNextItemId(prefix: string, existingIds: Set<string>, allocatedIds: Set<string>) {
  let max = 0;

  for (const id of existingIds) {
    const match = id.match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  for (const id of allocatedIds) {
    const match = id.match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return `${prefix}${max + 1}`;
}

const syncTranscribedPriceList = async () => {
  const client = await pool.connect();

  try {
    console.log('🔄 Syncing transcribed price list into live price_items table...');

    const existingResult = await client.query('SELECT item_id FROM price_items');
    const existingIds = new Set<string>(existingResult.rows.map((row) => String(row.item_id)));
    const allocatedIds = new Set<string>();

    let updatedCount = 0;
    let insertedCount = 0;

    await client.query('BEGIN');

    for (const item of catalogItems) {
      const prefix = prefixByCategory[item.category];
      const itemId = item.item_id || getNextItemId(prefix, existingIds, allocatedIds);

      allocatedIds.add(itemId);

      const result = await client.query(
        `INSERT INTO price_items (
          item_id, name, category, subcategory, unit, price, ironing_price, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        ON CONFLICT (tenant_id, item_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          subcategory = EXCLUDED.subcategory,
          unit = EXCLUDED.unit,
          price = EXCLUDED.price,
          ironing_price = EXCLUDED.ironing_price,
          is_active = TRUE
        RETURNING xmax = 0 AS inserted`,
        [
          itemId,
          item.name,
          item.category,
          item.subcategory || null,
          item.unit || 'piece',
          item.price,
          item.ironing_price,
        ]
      );

      if (result.rows[0]?.inserted) {
        insertedCount += 1;
      } else {
        updatedCount += 1;
      }
    }

    await client.query('COMMIT');

    const summary = await client.query(`
      SELECT
        COUNT(*)::int AS total_items,
        COUNT(*) FILTER (WHERE unit = 'kg')::int AS kg_items,
        COUNT(*) FILTER (WHERE unit = 'piece')::int AS piece_items,
        COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_items
      FROM price_items
    `);

    console.log('✅ Price list sync complete');
    console.log(`   - Updated: ${updatedCount}`);
    console.log(`   - Inserted: ${insertedCount}`);
    console.log(`   - Total items: ${summary.rows[0].total_items}`);
    console.log(`   - Piece items: ${summary.rows[0].piece_items}`);
    console.log(`   - Kg items: ${summary.rows[0].kg_items}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Price sync failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

syncTranscribedPriceList()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

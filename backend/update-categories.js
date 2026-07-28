const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function updateCategories() {
  try {
    await client.connect();
    console.log('Connected to database...\n');

    // Disable Salaries category (that's payroll, not operational expenses)
    await client.query(`
      UPDATE expense_categories 
      SET is_active = false 
      WHERE name = 'Salaries & Wages'
    `);
    console.log('✓ Disabled "Salaries & Wages" category');

    // Add realistic operational expense categories
    await client.query(`
      INSERT INTO expense_categories (name, description, color, is_active) 
      VALUES 
        ('IT Support', 'Computer repairs, software, technical support', '#3b82f6', true),
        ('Repairs & Maintenance', 'Equipment repairs, building maintenance, welding', '#ef4444', true),
        ('Transport & Delivery', 'Boda boda, fuel, delivery costs', '#10b981', true),
        ('Emergency Expenses', 'Urgent unplanned operational costs', '#f59e0b', true),
        ('Office Supplies', 'Stationery, printing, small office items', '#8b5cf6', true),
        ('Worker Payments', 'Casual workers, temporary help', '#ec4899', true)
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('✓ Added new operational expense categories\n');

    // Show active categories
    const result = await client.query(`
      SELECT name, description, color 
      FROM expense_categories 
      WHERE is_active = true 
      ORDER BY name
    `);

    console.log('Active Expense Categories:');
    console.log('='.repeat(60));
    result.rows.forEach(row => {
      console.log(`  ${row.name}`);
      console.log(`    ${row.description}`);
      console.log(`    Color: ${row.color}\n`);
    });

    await client.end();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

updateCategories();

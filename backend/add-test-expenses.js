const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function addTestExpenses() {
  try {
    await client.connect();
    console.log('Connected to database...\n');

    // Get admin user ID and category IDs
    const userResult = await client.query(`SELECT id, full_name FROM users WHERE role = 'ADMIN' LIMIT 1`);
    if (userResult.rows.length === 0) {
      console.error('No admin user found!');
      await client.end();
      return;
    }
    const adminId = userResult.rows[0].id;
    const adminName = userResult.rows[0].full_name;
    console.log(`Using admin user: ${adminName} (ID: ${adminId})\n`);

    // Get category IDs
    const categories = await client.query(`
      SELECT id, name FROM expense_categories WHERE is_active = true
    `);
    const categoryMap = {};
    categories.rows.forEach(cat => {
      categoryMap[cat.name] = cat.id;
    });

    // Test expenses for January 2026 (realistic operational costs)
    const testExpenses = [
      // Week 1 - Jan 1-5
      {
        date: '2026-01-02',
        category: 'Transport & Delivery',
        description: 'Boda boda to pick up urgent detergent supplies from Kikuubo',
        amount: 15000,
        paid_to: 'Boda driver - James',
        payment_method: 'CASH',
        notes: 'Urgent delivery needed before opening hours'
      },
      {
        date: '2026-01-03',
        category: 'Worker Payments',
        description: 'Casual worker helped with heavy laundry loads during busy afternoon',
        amount: 25000,
        paid_to: 'Moses (casual helper)',
        payment_method: 'CASH',
        notes: 'Extra help needed due to high customer volume'
      },
      {
        date: '2026-01-04',
        category: 'Repairs & Maintenance',
        description: 'Welder fixed broken washing machine drum support',
        amount: 65000,
        paid_to: 'Sam the Welder - corner shop',
        payment_method: 'MOBILE_MONEY',
        receipt_number: 'WLD-2026-001',
        notes: 'Machine 2 was making loud noise, fixed same day'
      },
      {
        date: '2026-01-05',
        category: 'Utilities',
        description: 'Electricity bill for December 2025',
        amount: 185000,
        paid_to: 'UMEME',
        payment_method: 'BANK_TRANSFER',
        receipt_number: 'UMEME-12-2025',
        notes: 'Monthly electricity payment'
      },
      
      // Week 2 - Jan 6-10
      {
        date: '2026-01-06',
        category: 'IT Support',
        description: 'Hussein came for network troubleshooting and printer setup',
        amount: 120000,
        paid_to: 'Hussein - IT Support',
        payment_method: 'MOBILE_MONEY',
        receipt_number: 'IT-2026-001',
        notes: 'Fixed WiFi issues and configured receipt printer'
      },
      {
        date: '2026-01-07',
        category: 'Transport & Delivery',
        description: 'Fuel for delivery van - customer home deliveries',
        amount: 80000,
        paid_to: 'Shell Petrol Station',
        payment_method: 'CARD',
        receipt_number: 'SHL-070126',
        notes: 'Full tank for weekend deliveries'
      },
      {
        date: '2026-01-08',
        category: 'Office Supplies',
        description: 'Receipt books, pens, and customer tags',
        amount: 22000,
        paid_to: 'Downtown Stationery',
        payment_method: 'CASH',
        notes: 'Running low on receipt books'
      },
      {
        date: '2026-01-09',
        category: 'Emergency Expenses',
        description: 'Urgent purchase of hangers - stock depleted',
        amount: 45000,
        paid_to: 'Supplier - Nakasero Market',
        payment_method: 'MOBILE_MONEY',
        notes: 'Customer orders waiting, needed immediate hangers'
      },
      {
        date: '2026-01-09',
        category: 'Worker Payments',
        description: 'Temporary cleaner for deep cleaning of shop floor',
        amount: 30000,
        paid_to: 'Jane (cleaner)',
        payment_method: 'CASH',
        notes: 'Deep cleaning after busy week'
      },
      {
        date: '2026-01-10',
        category: 'Transport & Delivery',
        description: 'Boda boda to deliver finished orders to customer office',
        amount: 18000,
        paid_to: 'Boda driver - Patrick',
        payment_method: 'CASH',
        notes: 'Urgent corporate delivery to Nakawa'
      },
      {
        date: '2026-01-10',
        category: 'Repairs & Maintenance',
        description: 'Plumber fixed water leak in washing area',
        amount: 55000,
        paid_to: 'John the Plumber',
        payment_method: 'MOBILE_MONEY',
        notes: 'Water was leaking overnight, emergency call'
      },
      {
        date: '2026-01-10',
        category: 'Office Supplies',
        description: 'Printing of promotional flyers and price lists',
        amount: 15000,
        paid_to: 'Quick Print Services',
        payment_method: 'CASH',
        receipt_number: 'QP-10012026',
        notes: 'New price list for 2026'
      }
    ];

    console.log('Creating test expenses...\n');
    let successCount = 0;

    for (const expense of testExpenses) {
      const categoryId = categoryMap[expense.category];
      if (!categoryId) {
        console.log(`⚠ Skipping - category not found: ${expense.category}`);
        continue;
      }

      await client.query(`
        INSERT INTO expenses (
          expense_date, category_id, description, amount, 
          payment_method, paid_to, receipt_number, notes, 
          recorded_by, approval_status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'APPROVED', $10)
      `, [
        expense.date,
        categoryId,
        expense.description,
        expense.amount,
        expense.payment_method,
        expense.paid_to,
        expense.receipt_number || null,
        expense.notes,
        adminId,
        expense.date + ' 08:00:00' // Set created time to morning of expense date
      ]);

      console.log(`✓ ${expense.date}: ${expense.description} - ${expense.amount.toLocaleString()} UGX`);
      successCount++;
    }

    console.log(`\n✅ Created ${successCount} test expenses\n`);

    // Show summary by category
    const summary = await client.query(`
      SELECT 
        ec.name as category,
        COUNT(*) as count,
        SUM(e.amount) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.approval_status = 'APPROVED'
        AND e.expense_date >= '2026-01-01'
        AND e.expense_date <= '2026-01-31'
      GROUP BY ec.name
      ORDER BY total DESC
    `);

    console.log('January 2026 Expense Summary:');
    console.log('='.repeat(60));
    let grandTotal = 0;
    summary.rows.forEach(row => {
      console.log(`  ${row.category.padEnd(30)} ${row.count} expenses  ${parseInt(row.total).toLocaleString().padStart(10)} UGX`);
      grandTotal += parseInt(row.total);
    });
    console.log('='.repeat(60));
    console.log(`  ${'TOTAL'.padEnd(30)} ${summary.rows.reduce((sum, r) => sum + parseInt(r.count), 0)} expenses  ${grandTotal.toLocaleString().padStart(10)} UGX`);
    console.log('');

    await client.end();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

addTestExpenses();

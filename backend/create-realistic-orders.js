const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

async function createRealisticOrders() {
  try {
    await client.connect();
    console.log('Creating realistic January 2026 orders...\n');

    // Get admin user and a customer
    const adminResult = await client.query(`SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`);
    const customerResult = await client.query(`SELECT id FROM customers LIMIT 1`);
    
    if (adminResult.rows.length === 0 || customerResult.rows.length === 0) {
      console.log('⚠ Need at least one admin user and one customer. Please create them first.');
      await client.end();
      return;
    }

    const adminId = adminResult.rows[0].id;
    const customerId = customerResult.rows[0].id;

    // Create realistic daily orders for January 2026
    const orders = [
      // Week 1
      { date: '2026-01-02', items: 15, amount: 245000, paid: 245000, status: 'PAID' },
      { date: '2026-01-02', items: 8, amount: 132000, paid: 132000, status: 'PAID' },
      { date: '2026-01-03', items: 22, amount: 358000, paid: 300000, status: 'PARTIAL' },
      { date: '2026-01-03', items: 12, amount: 198000, paid: 198000, status: 'PAID' },
      { date: '2026-01-04', items: 18, amount: 289000, paid: 0, status: 'UNPAID' },
      { date: '2026-01-04', items: 10, amount: 165000, paid: 165000, status: 'PAID' },
      { date: '2026-01-05', items: 25, amount: 412000, paid: 412000, status: 'PAID' },
      
      // Week 2
      { date: '2026-01-06', items: 30, amount: 485000, paid: 485000, status: 'PAID' },
      { date: '2026-01-06', items: 14, amount: 225000, paid: 200000, status: 'PARTIAL' },
      { date: '2026-01-07', items: 20, amount: 328000, paid: 328000, status: 'PAID' },
      { date: '2026-01-07', items: 16, amount: 265000, paid: 265000, status: 'PAID' },
      { date: '2026-01-08', items: 19, amount: 312000, paid: 312000, status: 'PAID' },
      { date: '2026-01-08', items: 11, amount: 178000, paid: 0, status: 'UNPAID' },
      { date: '2026-01-09', items: 28, amount: 456000, paid: 456000, status: 'PAID' },
      { date: '2026-01-09', items: 13, amount: 215000, paid: 215000, status: 'PAID' },
      { date: '2026-01-10', items: 24, amount: 395000, paid: 395000, status: 'PAID' },
      { date: '2026-01-10', items: 17, amount: 278000, paid: 250000, status: 'PARTIAL' },
    ];

    console.log('Creating orders...\n');
    let totalRevenue = 0;
    let totalPaid = 0;

    for (const order of orders) {
      const orderResult = await client.query(`
        INSERT INTO orders (
          order_number,
          customer_id,
          user_id,
          subtotal,
          discount,
          tax,
          total,
          total_amount,
          payment_status,
          amount_paid,
          balance,
          order_status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `, [
        'ORD-' + order.date.replace(/-/g, '') + '-' + Math.floor(Math.random() * 1000),
        customerId,
        adminId,
        order.amount,
        0,
        0,
        order.amount,
        order.amount,
        order.status,
        order.paid,
        order.amount - order.paid,
        'DELIVERED',
        order.date + ' 10:00:00'
      ]);

      // Update financial_summary for this date
      await client.query(`
        INSERT INTO financial_summary (summary_date, total_revenue, orders_count, updated_at)
        VALUES (DATE($1::timestamp), $2, 1, NOW())
        ON CONFLICT (summary_date) 
        DO UPDATE SET
          total_revenue = financial_summary.total_revenue + $2,
          orders_count = financial_summary.orders_count + 1,
          net_profit = (financial_summary.total_revenue + $2) - financial_summary.total_expenses - COALESCE(financial_summary.total_salaries, 0),
          updated_at = NOW()
      `, [order.date + ' 10:00:00', order.amount]);

      totalRevenue += order.amount;
      totalPaid += order.paid;
      console.log(`✓ ${order.date}: ${order.items} items, ${order.amount.toLocaleString()} UGX (${order.status})`);
    }

    console.log(`\n✅ Created ${orders.length} orders\n`);

    // Show financial summary
    const summary = await client.query(`
      SELECT 
        COALESCE(SUM(total_revenue), 0) as revenue,
        COALESCE(SUM(total_expenses), 0) as expenses,
        COALESCE(SUM(total_salaries), 0) as salaries,
        COALESCE(SUM(net_profit), 0) as profit
      FROM financial_summary
      WHERE summary_date >= '2026-01-01' AND summary_date <= '2026-01-31'
    `);

    const s = summary.rows[0];
    console.log('January 2026 Financial Summary:');
    console.log('='.repeat(70));
    console.log(`Revenue:      ${parseInt(s.revenue).toLocaleString().padStart(12)} UGX`);
    console.log(`Expenses:     ${parseInt(s.expenses).toLocaleString().padStart(12)} UGX`);
    console.log(`Salaries:     ${parseInt(s.salaries).toLocaleString().padStart(12)} UGX`);
    console.log('='.repeat(70));
    const totalCosts = parseInt(s.expenses) + parseInt(s.salaries);
    console.log(`Total Costs:  ${totalCosts.toLocaleString().padStart(12)} UGX`);
    console.log('='.repeat(70));
    console.log(`NET PROFIT:   ${parseInt(s.profit).toLocaleString().padStart(12)} UGX ✅`);
    console.log('='.repeat(70));
    
    const profitMargin = ((parseInt(s.profit) / parseInt(s.revenue)) * 100).toFixed(1);
    console.log(`\nProfit Margin: ${profitMargin}%`);
    console.log(`Break-even needed: ${totalCosts.toLocaleString()} UGX`);
    console.log(`Achieved: ${parseInt(s.revenue).toLocaleString()} UGX`);
    
    await client.end();
    console.log('\n✓ Complete! Refresh your Financial Dashboard to see realistic data!');
  } catch (error) {
    console.error('Error:', error.message);
    await client.end();
  }
}

createRealisticOrders();

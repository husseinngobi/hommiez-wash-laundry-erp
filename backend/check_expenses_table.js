const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lush_laundry',
  user: 'postgres',
  password: process.env.DB_PASSWORD
});

pool.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'expenses' 
  ORDER BY ordinal_position
`).then(r => {
  console.log('Expenses table columns:');
  r.rows.forEach(c => console.log(`- ${c.column_name}: ${c.data_type}`));
  pool.end();
}).catch(e => {
  console.error(e);
  pool.end();
});

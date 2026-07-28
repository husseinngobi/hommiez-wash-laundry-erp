#!/usr/bin/env node

/**
 * Interactive Production Cleanup Script
 * 
 * Safely cleans test data before going live
 * - Shows current data counts
 * - Asks for confirmation
 * - Creates backup option
 * - Resets all sequences
 */

const { Pool } = require('pg');
const readline = require('readline');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'lush_laundry',
  password: process.env.DB_PASSWORD,
  port: 5432
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function getCurrentCounts(client) {
  const counts = {};
  
  const tables = [
    'customers',
    'orders',
    'order_items',
    'payments',
    'pending_payments',
    'inventory_items',
    'deliveries'
  ];
  
  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
    counts[table] = parseInt(result.rows[0].count);
  }
  
  return counts;
}

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupFile = path.join(__dirname, `backup_${timestamp}.sql`);
  
  console.log('\n📦 Creating backup...');
  
  return new Promise((resolve, reject) => {
    exec(
      `pg_dump -U postgres -h localhost lush_laundry > "${backupFile}"`,
      (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Backup failed:', error.message);
          reject(error);
        } else {
          console.log(`✅ Backup created: ${backupFile}`);
          resolve(backupFile);
        }
      }
    );
  });
}

async function cleanTestData() {
  const client = await pool.connect();
  
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION DEPLOYMENT: Clean Test Data          ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
    // Step 1: Show current counts
    console.log('📊 Current Database Status:\n');
    const counts = await getCurrentCounts(client);
    
    console.log('   Customers:       ', counts.customers);
    console.log('   Orders:          ', counts.orders);
    console.log('   Order Items:     ', counts.order_items);
    console.log('   Payments:        ', counts.payments);
    console.log('   Pending Payments:', counts.pending_payments);
    console.log('   Inventory Items: ', counts.inventory_items);
    console.log('   Deliveries:      ', counts.deliveries);
    
    console.log('\n⚠️  WARNING: This will DELETE ALL the data above!');
    console.log('⚠️  This action CANNOT be undone!\n');
    
    // Step 2: Ask for backup
    const wantBackup = await question('Do you want to create a backup first? (yes/no): ');
    
    if (wantBackup.toLowerCase() === 'yes' || wantBackup.toLowerCase() === 'y') {
      try {
        await createBackup();
      } catch (error) {
        console.log('\n❌ Backup failed. Aborting cleanup for safety.');
        return;
      }
    } else {
      console.log('\n⚠️  Proceeding without backup...');
    }
    
    // Step 3: Final confirmation
    console.log('\n════════════════════════════════════════════════════');
    const confirm1 = await question('Type "DELETE ALL DATA" to confirm: ');
    
    if (confirm1 !== 'DELETE ALL DATA') {
      console.log('\n❌ Confirmation failed. Cleanup cancelled.');
      return;
    }
    
    const confirm2 = await question('Are you ABSOLUTELY SURE? (yes/no): ');
    
    if (confirm2.toLowerCase() !== 'yes') {
      console.log('\n❌ Cleanup cancelled.');
      return;
    }
    
    // Step 4: Execute cleanup
    console.log('\n🗑️  Deleting test data...\n');
    
    await client.query('BEGIN');
    
    // Delete in correct order (respecting foreign keys)
    const deleteTables = [
      { name: 'order_items', desc: 'Order Items' },
      { name: 'payments', desc: 'Payments' },
      { name: 'pending_payments', desc: 'Pending Payments' },
      { name: 'orders', desc: 'Orders' },
      { name: 'delivery_assignments', desc: 'Delivery Assignments' },
      { name: 'deliveries', desc: 'Deliveries' },
      { name: 'inventory_transactions', desc: 'Inventory Transactions' },
      { name: 'inventory_items', desc: 'Inventory Items' },
      { name: 'customers', desc: 'Customers' }
    ];
    
    for (const table of deleteTables) {
      const result = await client.query(`DELETE FROM ${table.name}`);
      console.log(`   ✓ Deleted ${result.rowCount || 0} ${table.desc}`);
    }
    
    // Clean related notifications and audit logs
    await client.query(`DELETE FROM notifications WHERE entity_type IN ('order', 'customer', 'payment', 'inventory')`);
    await client.query(`DELETE FROM audit_logs WHERE entity_type IN ('order', 'customer', 'payment', 'inventory')`);
    
    console.log('\n🔄 Resetting ID sequences...\n');
    
    // Reset sequences
    const sequences = [
      'customers_id_seq',
      'orders_id_seq',
      'order_items_id_seq',
      'payments_id_seq',
      'inventory_items_id_seq',
      'deliveries_id_seq',
      'pending_payments_id_seq'
    ];
    
    for (const seq of sequences) {
      await client.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
      console.log(`   ✓ Reset ${seq}`);
    }
    
    await client.query('COMMIT');
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║             ✅ CLEANUP SUCCESSFUL!                 ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
    console.log('📋 Next IDs will be:\n');
    console.log('   Customer ID:    CUST20260001');
    console.log('   Order Number:   ORD20260001');
    console.log('   Invoice Number: INV-2026-000001\n');
    
    console.log('🚀 System is ready for production data!\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error during cleanup:', error.message);
    console.log('⏪ All changes rolled back. Database unchanged.\n');
  } finally {
    client.release();
    rl.close();
    await pool.end();
  }
}

// Run the cleanup
cleanTestData().catch(console.error);

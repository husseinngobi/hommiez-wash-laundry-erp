import PDFDocument from 'pdfkit';
import { query } from '../config/database';

interface DateRange {
  fromDate?: string;
  toDate?: string;
}

function dateFilterClause(column: string, range: DateRange, paramOffset: number): { clause: string; values: any[] } {
  const values: any[] = [];
  let clause = '';
  if (range.fromDate) {
    values.push(range.fromDate);
    clause += ` AND ${column} >= $${paramOffset + values.length}`;
  }
  if (range.toDate) {
    values.push(range.toDate);
    clause += ` AND ${column} <= $${paramOffset + values.length}`;
  }
  return { clause, values };
}

async function fetchCustomers(range: DateRange) {
  const { clause, values } = dateFilterClause('created_at', range, 0);
  const result = await query(`SELECT * FROM customers WHERE 1=1 ${clause} ORDER BY created_at DESC`, values);
  return result.rows;
}

async function fetchOrdersWithItems(range: DateRange) {
  const { clause, values } = dateFilterClause('o.created_at', range, 0);
  const ordersResult = await query(
    `SELECT o.*, o.status as order_status, c.name as customer_name, c.phone as customer_phone
     FROM orders o JOIN customers c ON o.customer_id = c.id
     WHERE 1=1 ${clause}
     ORDER BY o.created_at DESC`,
    values
  );

  const orders = ordersResult.rows;
  if (orders.length === 0) return orders;

  // Fetch ALL items for ALL orders in a single query instead of one query per order
  const orderIds = orders.map((o: any) => o.id);
  const itemsResult = await query(
    `SELECT oi.order_id, pi.name as item_name, oi.service_type, oi.quantity, oi.unit_price, oi.total_price
     FROM order_items oi
     JOIN price_items pi ON oi.price_item_id = pi.id
     WHERE oi.order_id = ANY($1::int[])
     ORDER BY oi.order_id, oi.id`,
    [orderIds]
  );

  const itemsByOrderId = new Map<number, any[]>();
  for (const item of itemsResult.rows) {
    if (!itemsByOrderId.has(item.order_id)) {
      itemsByOrderId.set(item.order_id, []);
    }
    itemsByOrderId.get(item.order_id)!.push(item);
  }

  for (const order of orders) {
    order.items = itemsByOrderId.get(order.id) || [];
  }

  return orders;
}

async function fetchInventory() {
  const result = await query(`SELECT * FROM inventory_items ORDER BY item_name`);
  return result.rows;
}

async function fetchDeliveries(range: DateRange) {
  const { clause, values } = dateFilterClause('d.scheduled_date', range, 0);
  const result = await query(
    `SELECT d.*, o.order_number, c.name as customer_name
     FROM deliveries d
     JOIN orders o ON d.order_id = o.id
     JOIN customers c ON o.customer_id = c.id
     WHERE 1=1 ${clause}
     ORDER BY d.scheduled_date DESC`,
    values
  );
  return result.rows;
}

/**
 * Build a professional PDF backup document covering the requested tables.
 * `tables` is the same comma-separated selection already used by the JSON backup
 * (e.g. 'all', 'customers', 'orders,order_items', 'inventory_items,inventory_transactions',
 * 'deliveries', 'customers,orders,order_items').
 */
export async function generateBackupPDF(tables: string, range: DateRange = {}): Promise<Buffer> {
  const wantAll = tables === 'all';
  const wantCustomers = wantAll || tables.includes('customers');
  const wantOrders = wantAll || tables.includes('orders');
  const wantInventory = wantAll || tables.includes('inventory');
  const wantDeliveries = wantAll || tables.includes('deliveries');

  const [customers, orders, inventory, deliveries] = await Promise.all([
    wantCustomers ? fetchCustomers(range) : Promise.resolve([]),
    wantOrders ? fetchOrdersWithItems(range) : Promise.resolve([]),
    wantInventory ? fetchInventory() : Promise.resolve([]),
    wantDeliveries ? fetchDeliveries(range) : Promise.resolve([]),
  ]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).fillColor('#6366f1').text('Lush Laundry — Backup Report', { align: 'center' });
    const rangeLabel = range.fromDate || range.toDate
      ? `${range.fromDate || 'earliest'} to ${range.toDate || 'latest'}`
      : 'All time (full history)';
    doc.fontSize(11).fillColor('#666').text(rangeLabel, { align: 'center' });
    doc.moveDown(1.5);

    if (wantCustomers) {
      doc.fontSize(16).fillColor('#111').text(`Customers (${customers.length})`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#333');
      if (customers.length === 0) {
        doc.text('No customer records in this range.');
      } else {
        customers.forEach((c: any) => {
          doc.text(`${c.customer_id || c.id}  |  ${c.name}  |  ${c.phone}  |  ${c.customer_type || ''}  |  Registered: ${new Date(c.created_at).toLocaleDateString('en-GB')}`);
        });
      }
      doc.moveDown(1.5);
    }

    if (wantOrders) {
      doc.fontSize(16).fillColor('#111').text(`Orders (${orders.length})`, { underline: true });
      doc.moveDown(0.5);
      if (orders.length === 0) {
        doc.fontSize(9).fillColor('#333').text('No order records in this range.');
      } else {
        orders.forEach((order: any) => {
          doc.fontSize(10).fillColor('#111').text(
            `${order.order_number}  |  ${order.customer_name} (${order.customer_phone})  |  Status: ${order.order_status || 'N/A'}  |  Payment: ${order.payment_status || 'N/A'}  |  Total: UGX ${parseFloat(order.total_amount).toLocaleString()}  |  ${new Date(order.created_at).toLocaleDateString('en-GB')}`
          );
          (order.items || []).forEach((item: any) => {
            doc.fontSize(8).fillColor('#555').text(
              `      • ${item.item_name} (${item.service_type}) x${item.quantity} — UGX ${parseFloat(item.total_price).toLocaleString()}`
            );
          });
          doc.moveDown(0.4);
        });
      }
      doc.moveDown(1);
    }

    if (wantInventory) {
      doc.fontSize(16).fillColor('#111').text(`Inventory (${inventory.length})`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#333');
      if (inventory.length === 0) {
        doc.text('No inventory records.');
      } else {
        inventory.forEach((item: any) => {
          doc.text(`${item.item_name}  |  Qty: ${item.quantity ?? 'N/A'}  |  Unit: ${item.unit || ''}  |  Unit Cost: UGX ${(item.unit_cost || 0).toLocaleString()}${item.is_active === false ? '  |  INACTIVE' : ''}`);
        });
      }
      doc.moveDown(1.5);
    }

    if (wantDeliveries) {
      doc.fontSize(16).fillColor('#111').text(`Deliveries (${deliveries.length})`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#333');
      if (deliveries.length === 0) {
        doc.text('No delivery records in this range.');
      } else {
        deliveries.forEach((d: any) => {
          doc.text(`${d.order_number}  |  ${d.customer_name}  |  ${d.delivery_type}  |  ${d.scheduled_time_slot || 'Not set'}  |  ${d.delivery_status}`);
        });
      }
      doc.moveDown(1.5);
    }

    doc.fontSize(8).fillColor('#999').text(`Generated on ${new Date().toLocaleString('en-GB')}`, { align: 'center' });
    doc.end();
  });
}
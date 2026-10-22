import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import {
  buildBusinessInfoLines,
  buildReceiptClosingMessage,
  buildReceiptSummaryLines,
  formatReceiptItemText,
  ReceiptItem,
  ReceiptOrderStatus,
} from '../utils/receiptFormatter';

interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  totalPrice: number;
}

interface OrderDetails {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  orderDate: Date;
  pickupDate: Date;
  items: OrderItem[];
  subtotal: number;
  orderDiscountAmount: number;
  bargainAmount: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balance: number;
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  orderStatus?: ReceiptOrderStatus;
}

/**
 * Generate PDF receipt for an order
 * Returns the file path of the generated PDF
 */
export const generateOrderReceiptPDF = async (orderDetails: OrderDetails): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      // Create receipts directory if it doesn't exist
      const receiptsDir = path.join(__dirname, '../../receipts');
      if (!fs.existsSync(receiptsDir)) {
        fs.mkdirSync(receiptsDir, { recursive: true });
      }

      // Generate filename
      const filename = `receipt_${orderDetails.orderNumber}_${Date.now()}.pdf`;
      const filepath = path.join(receiptsDir, filename);

      // Create PDF document
      const doc = new PDFDocument({
        size: [226.77, 841.89], // 80mm thermal printer width (226.77 points = 80mm)
        margins: { top: 20, bottom: 20, left: 20, right: 20 },
      });

      // Pipe to file
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Format dates
      const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      };

      const orderDate = formatDate(orderDetails.orderDate);
      const pickupDate = formatDate(orderDetails.pickupDate);

      // Set font
      doc.font('Courier');

      // Header border
      doc.fontSize(8).text('══════════════════════════════════', { align: 'center' });
      
      // Business name
      doc.fontSize(10)
         .text('HOMMIEZ WASH LAUNDRY AND DRY CLEANERS', { align: 'center' })
         .text('& LAUNDROMAT', { align: 'center' });
      
      // Header border
      doc.fontSize(8).text('══════════════════════════════════', { align: 'center' });
      
      // Title
      doc.fontSize(9)
         .moveDown(0.5)
         .text('ORDER RECEIPT', { align: 'center' })
         .moveDown(0.5);

      // Order details
      const businessInfo = buildBusinessInfoLines();

      doc.fontSize(8)
         .text(`Order No : ${orderDetails.orderNumber}`)
         .text(`Date     : ${orderDate}`)
         .text(`Customer : ${orderDetails.customerName}`)
        .text(businessInfo.join('\n'))
         .text('──────────────────────────────────')
         .moveDown(0.3);

      // Items header
      doc.text('ITEMS')
         .text('──────────────────────────────────')
         .text('Item                Qty   Amount')
         .text('──────────────────────────────────');

      // Items list
      orderDetails.items.forEach((item) => {
        const itemLines = formatReceiptItemText(item as ReceiptItem).split('\n');
        itemLines.forEach((line) => doc.text(line));
        doc.text('──────────────────────────────────');
      });

      doc.moveDown(0.3);

      // Financial summary
      buildReceiptSummaryLines({
        subtotal: orderDetails.subtotal,
        orderDiscountAmount: orderDetails.orderDiscountAmount,
        bargainAmount: orderDetails.bargainAmount,
        taxAmount: orderDetails.taxAmount,
        total: orderDetails.total,
        amountPaid: orderDetails.amountPaid,
        balance: orderDetails.balance,
      }).forEach((line) => doc.text(line));

      doc.text('──────────────────────────────────')
         .moveDown(0.3);

      // Pickup date
      doc.text(`Pickup Date : ${pickupDate}`)
         .text('══════════════════════════════════')
         .moveDown(0.5);

      // Footer
      const closing = buildReceiptClosingMessage({
        customerName: orderDetails.customerName,
        orderNumber: orderDetails.orderNumber,
        orderStatus: orderDetails.orderStatus || 'pending',
        paymentStatus: orderDetails.paymentStatus,
        subtotal: orderDetails.subtotal,
        orderDiscountAmount: orderDetails.orderDiscountAmount,
        bargainAmount: orderDetails.bargainAmount,
        taxAmount: orderDetails.taxAmount,
        total: orderDetails.total,
        amountPaid: orderDetails.amountPaid,
        balance: orderDetails.balance,
      });

      doc.text(closing.trim(), { align: 'center' })
        .text('For inquiries, please call us.', { align: 'center' });

      // Finalize PDF
      doc.end();

      // Wait for file to be written
      stream.on('finish', () => {
        console.log(`✅ PDF receipt generated: ${filename}`);
        resolve(filepath);
      });

      stream.on('error', (error) => {
        console.error('❌ PDF generation error:', error);
        reject(error);
      });

    } catch (error) {
      console.error('❌ PDF generation error:', error);
      reject(error);
    }
  });
};

/**
 * Clean up old receipt files (older than 24 hours)
 */
export const cleanupOldReceipts = () => {
  const receiptsDir = path.join(__dirname, '../../receipts');
  
  if (!fs.existsSync(receiptsDir)) return;

  const files = fs.readdirSync(receiptsDir);
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  files.forEach((file) => {
    const filepath = path.join(receiptsDir, file);
    const stats = fs.statSync(filepath);
    const fileAge = now - stats.mtimeMs;

    if (fileAge > oneDayMs) {
      fs.unlinkSync(filepath);
      console.log(`🗑️ Cleaned up old receipt: ${file}`);
    }
  });
};

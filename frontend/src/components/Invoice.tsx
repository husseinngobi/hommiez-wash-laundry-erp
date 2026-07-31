import { useEffect, useState, useRef, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { formatUGX } from '@/lib/currency';
import { COLLECTION_GRACE_DAYS, UNCOLLECTED_DONATION_MONTHS } from '@/lib/whatsapp';
import axios from 'axios';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Printer, Download } from 'lucide-react';

interface InvoiceProps {
  orderId: number;
  token: string;
  onClose?: () => void;
}

interface BusinessSettings {
  ura_compliance_enabled: boolean;
  business_tin: string;
  fiscal_device_number: string;
  business_name: string;
  business_location: string;
  business_address: string;
  business_phone: string;
  business_email: string;
  vat_rate: string;
  invoice_footer_text: string;
}

interface OrderDetails {
  id: number;
  order_number: string;
  invoice_number: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance: number;
  payment_method: string;
  payment_status: string;
  fiscal_verification_code: string;
  staff_name: string;
  branch_name?: string | null;
}

interface OrderItem {
  item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export default function Invoice({ orderId, token, onClose }: InvoiceProps) {
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const invoiceRef = useRef<HTMLDivElement>(null);

  const loadInvoiceData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load order details with items
      const orderRes = await axios.get(`${API_BASE_URL}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Backend returns { order: {...}, items: [...] }
      const orderData = orderRes.data.order;
      const itemsData = orderRes.data.items || [];
      
      // Load business settings
      const settingsRes = await axios.get(`${API_BASE_URL}/settings/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const uraEnabled = settingsRes.data.ura_compliance_enabled === 'true' || settingsRes.data.ura_compliance_enabled === true;
      
      const settingsData: BusinessSettings = {
        ura_compliance_enabled: uraEnabled,
        business_tin: settingsRes.data.business_tin || '',
        fiscal_device_number: settingsRes.data.fiscal_device_number || '',
        business_name: settingsRes.data.business_name || 'LUSH DRY CLEANERS & LAUNDROMAT',
        business_location: settingsRes.data.business_location || '',
        business_address: settingsRes.data.business_address || 'Kampala, Uganda',
        business_phone: settingsRes.data.business_phone || '',
        business_email: settingsRes.data.business_email || 'info@lushlaundry.com',
        vat_rate: settingsRes.data.vat_rate || '18.00',
        invoice_footer_text: settingsRes.data.invoice_footer_text || 'Thank you for your business!',
      };
      
      setOrder(orderData);
      setOrderItems(itemsData);
      setSettings(settingsData);
      
      // Generate QR code with invoice data (include TIN only if URA enabled)
      const qrDataObj: Record<string, string> = {
        invoice: orderData.invoice_number,
        amount: orderData.total_amount.toString(),
        date: new Date(orderData.created_at).toISOString(),
      };
      
      if (uraEnabled) {
        qrDataObj.tin = settingsData.business_tin;
        qrDataObj.verification = orderData.fiscal_verification_code || 'PENDING-EFRIS-INTEGRATION';
      }
      
      const qrData = JSON.stringify(qrDataObj);
      
      const qr = await QRCode.toDataURL(qrData, {
        width: 200,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      setQrCodeUrl(qr);
    } catch (error) {
      console.error('Failed to load invoice data:', error);
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    loadInvoiceData();
  }, [loadInvoiceData]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (!order) return;
    
    const printWindow = window.open('', '_blank');
    if (printWindow && invoiceRef.current) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Invoice ${order.invoice_number}</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: 'Courier New', monospace; padding: 20px; }
              ${getInvoiceStyles()}
            </style>
          </head>
          <body>
            ${invoiceRef.current.innerHTML}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const getInvoiceStyles = () => `
    .invoice-container { max-width: 800px; margin: 0 auto; border: 2px solid #000; padding: 20px; }
    .invoice-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 15px; }
    .business-name { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
    .divider { border-top: 1px dashed #000; margin: 10px 0; }
    .section-title { font-weight: bold; margin-top: 15px; margin-bottom: 5px; }
    .info-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .items-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    .items-table th, .items-table td { text-align: left; padding: 5px; }
    .items-table th { border-bottom: 1px solid #000; }
    .text-right { text-align: right; }
    .total-section { border-top: 2px solid #000; margin-top: 10px; padding-top: 10px; }
    .qr-section { text-align: center; margin-top: 15px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  `;

  if (loading || !order || !settings) {
    return <div className="p-8 text-center">Loading invoice...</div>;
  }

  return (
    <div className="p-6 bg-white">
      {/* Print Controls */}
      <div className="no-print flex justify-end gap-2 mb-4">
        <Button onClick={handlePrint} className="flex items-center gap-2">
          <Printer className="h-4 w-4" />
          Print Invoice
        </Button>
        <Button onClick={handleDownload} variant="outline" className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
        {onClose && (
          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
        )}
      </div>

      {/* Invoice Content */}
      <div ref={invoiceRef} className="invoice-container border-2 border-black p-6 max-w-4xl mx-auto bg-white font-mono text-sm">
        {/* Header */}
        <div className="text-center border-b-2 border-black pb-4 mb-4">
          <h1 className="text-2xl font-bold mb-2">{settings.business_name.toUpperCase()}</h1>
          <div className="text-xs">
            {settings.ura_compliance_enabled && (
              <p>TIN: {settings.business_tin || '[NOT SET - Configure in Settings]'}</p>
            )}
            <p>{[settings.business_address, settings.business_location].filter(Boolean).join(', ')}</p>
            {order?.branch_name && <p>Branch: {order.branch_name}</p>}
            <p>Tel: {settings.business_phone} | Email: {settings.business_email}</p>
            {settings.ura_compliance_enabled && settings.fiscal_device_number && (
              <p>Fiscal Device No: {settings.fiscal_device_number}</p>
            )}
          </div>
        </div>

        {/* Invoice Info */}
        <div className="border-t border-dashed border-black pt-3 mb-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p><strong>Invoice No:</strong> {order.invoice_number}</p>
              <p><strong>Order No:</strong> {order.order_number}</p>
              <p><strong>Date:</strong> {new Date(order.created_at).toLocaleString('en-GB')}</p>
              <p><strong>Cashier:</strong> {order.staff_name}</p>
            </div>
            <div className="text-right">
              <p><strong>Customer:</strong> {order.customer_name}</p>
              <p><strong>Phone:</strong> {order.customer_phone}</p>
              {order.customer_email && <p><strong>Email:</strong> {order.customer_email}</p>}
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="border-t border-dashed border-black pt-3 mb-3">
          <h3 className="font-bold mb-2">ITEMS:</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black">
                <th className="text-left py-1">Description</th>
                <th className="text-center py-1">Qty</th>
                <th className="text-right py-1">Price</th>
                <th className="text-right py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {orderItems.map((item, index) => (
                <tr key={index}>
                  <td className="py-1">{item.item_name}</td>
                  <td className="text-center">{item.quantity}</td>
                  <td className="text-right">{formatUGX(item.unit_price)}</td>
                  <td className="text-right">{formatUGX(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t-2 border-black pt-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatUGX(order.subtotal)}</span>
            </div>
            {settings.ura_compliance_enabled && order.tax_amount > 0 && (
              <div className="flex justify-between">
                <span>VAT ({order.tax_rate}%):</span>
                <span>{formatUGX(order.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t border-dashed border-black pt-2 mt-2">
              <span>TOTAL:</span>
              <span>{formatUGX(order.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Payment Info */}
        <div className="border-t border-dashed border-black pt-3 mt-3 text-xs">
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Payment Method:</span>
              <span>{order.payment_method.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount Paid:</span>
              <span>{formatUGX(order.amount_paid)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Balance Due:</span>
              <span>{formatUGX(order.balance)}</span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <span className={order.payment_status === 'PAID' ? 'text-green-600 font-bold' : 'text-orange-600 font-bold'}>
                {order.payment_status}
              </span>
            </div>
          </div>
        </div>

        {/* EFRIS Verification - Only show when URA compliance is enabled */}
        {settings.ura_compliance_enabled && (
          <div className="border-t-2 border-black pt-3 mt-3 text-xs text-center">
            <p className="font-bold">EFRIS Verification Code:</p>
            <p className="font-mono text-lg my-2">
              {order.fiscal_verification_code || 'PENDING-EFRIS-INTEGRATION'}
            </p>
            {!settings.fiscal_device_number && (
              <p className="text-red-600 text-xs italic">
                (Configure TIN & FDN in Settings for URA compliance)
              </p>
            )}
          </div>
        )}

        {/* QR Code */}
        {qrCodeUrl && (
          <div className="text-center mt-4">
            <img src={qrCodeUrl} alt="Invoice QR Code" className="mx-auto w-[150px] h-[150px]" />
            <p className="text-xs mt-2">Scan to verify invoice</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t-2 border-black pt-3 mt-4 text-center text-xs">
          <p className="font-bold">{settings.invoice_footer_text}</p>
          
          {/* Customer Disclaimer - IMPORTANT */}
          <div className="border-2 border-red-600 p-2 my-3 bg-red-50">
            <p className="font-bold text-red-600 text-sm mb-1">⚠️ IMPORTANT NOTICE ⚠️</p>
            <p className="text-red-700 font-semibold">
              Please CHECK ALL ITEMS before leaving the premises.
            </p>
            <p className="text-red-700 font-semibold">
              Any complaints after 7 DAYS from pickup will NOT be accepted.
            </p>
          </div>
          
          <div className="border border-black p-2 my-3 text-left">
            <p className="font-bold mb-1">COLLECTION POLICY</p>
            <p>
              Kindly collect your items within {COLLECTION_GRACE_DAYS} days of being notified
              that they are ready. We do not have storage facilities for garments, so items
              held beyond {COLLECTION_GRACE_DAYS} days attract a storage charge and are kept
              at the owner&apos;s risk. Items left uncollected for over{' '}
              {UNCOLLECTED_DONATION_MONTHS} months are donated to charity.
            </p>
          </div>

          <p className="mt-2">Goods sold are not returnable</p>
          <p>For inquiries: {settings.business_phone}</p>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .invoice-container, .invoice-container * {
            visibility: visible;
          }
          .invoice-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

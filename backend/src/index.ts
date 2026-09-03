import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config';
import routes from './routes';
import { errorHandler, notFound } from './middleware/error';
import { 
  helmetConfig, 
  hppProtection, 
  hideServerInfo, 
  extractRealIP 
} from './middleware/security.middleware';
import { initializeBackupScheduler } from './services/backup.scheduler';
import { cleanupOldReceipts } from './services/pdf.service';
import path from 'path';
import dns from 'dns';
import { ensureDirectories } from './utils/ensureDirectories';
import { tenantContextMiddleware } from './middleware/tenant';
import { ensureOrderItemServiceTypes } from './database/ensureOrderItemServiceTypes';
import { backfillMissingPaymentTransactions } from './database/backfillMissingPayments';
import { ensureInventoryAssetColumns } from './database/ensureInventoryAssetColumns';
import { ensureOrderItemDiscountColumn } from './database/ensureOrderItemDiscountColumn';
import { ensureBranchSupport } from './database/ensureBranchSupport';
import { ensureNotificationColumns } from './database/ensureNotificationColumns';
import { ensureDeliveryPaymentColumns } from './database/ensureDeliveryPaymentColumns';
import { ensureItemBargainLimit } from './database/ensureItemBargainLimit';
import { ensureWeightPricing } from './database/ensureWeightPricing';
import { ensureCatalogueKgColumn } from './database/ensureCatalogueKgColumn';
import { ensureDamageClaims } from './database/ensureDamageClaims';
import { ensureSurcharges } from './database/ensureSurcharges';
import { ensureNotificationReads } from './database/ensureNotificationReads';
import { ensurePaymentCancellation } from './database/ensurePaymentCancellation';
import { ensureBranchScopedData } from './database/ensureBranchScopedData';
import { ensureGhostStaffRemoved } from './database/ensureGhostStaffRemoved';
import { ensureBackdatedPaymentDates } from './database/ensureBackdatedPaymentDates';

// Force IPv4 DNS resolution to avoid unreachable IPv6 routes in some environments.
dns.setDefaultResultOrder('ipv4first');

const app = express();

// Required for correct client IP handling behind reverse proxies (Render, Nginx, etc.).
app.set('trust proxy', 1);

// Security middleware (must be early in the chain)
app.use(helmetConfig); // Security headers
app.use(hppProtection); // HTTP Parameter Pollution protection
app.use(hideServerInfo); // Hide server info
app.use(extractRealIP); // Extract real IP for rate limiting

// Mark API responses as non-indexable by search engines.
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  next();
});

// CORS middleware - configure based on environment
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    // In development, allow all origins for network access (WiFi, hotspot, etc.)
    if (config.nodeEnv === 'development') {
      return callback(null, true);
    }
    
    // In production, only allow configured frontend URL(s)
    const allowedOrigins = [
      config.cors.origin,
      // Add additional production domains if needed
    ].filter(Boolean);
    
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Serve static files from uploads directory with explicit CORS headers
app.use('/uploads', (req, res, next) => {
  // Allow requests from any origin in development (config.cors.origin = true)
  const allowedOrigin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
}, express.static(path.join(__dirname, '../uploads')));

// API routes
app.use('/api', tenantContextMiddleware);
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Lush Laundry ERP API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      customers: '/api/customers',
      prices: '/api/prices',
      orders: '/api/orders',
      reports: '/api/reports',
    },
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Ensure DB accepts WASH/IRON/EXPRESS (fixes legacy wash|iron-only constraint)
    try {
      await ensureOrderItemServiceTypes();
    } catch (migrationError) {
      console.error('⚠️ order_items service_type migration skipped or failed:', migrationError);
    }

    // Repair PAID orders that never got a payments ledger row (accounting / Payments page)
    try {
      await backfillMissingPaymentTransactions();
    } catch (backfillError) {
      console.error('⚠️ payment backfill skipped or failed:', backfillError);
    }

    // Long-term equipment asset columns
    try {
      await ensureInventoryAssetColumns();
    } catch (assetError) {
      console.error('⚠️ inventory asset columns skipped or failed:', assetError);
    }

    // Per-item discounts on order lines
    try {
      await ensureOrderItemDiscountColumn();
    } catch (discountError) {
      console.error('⚠️ order item discount column skipped or failed:', discountError);
    }

    // Branch-based operations (branches table + users/orders branch_id)
    try {
      await ensureBranchSupport();
    } catch (branchError) {
      console.error('⚠️ branch support skipped or failed:', branchError);
    }

    // Notifications table shape (sender_id, link, nullable user_id)
    try {
      await ensureNotificationColumns();
    } catch (notificationError) {
      console.error('⚠️ notification columns skipped or failed:', notificationError);
    }

    // Delivery payment tracking columns
    try {
      await ensureDeliveryPaymentColumns();
    } catch (deliveryPaymentError) {
      console.error('⚠️ delivery payment columns skipped or failed:', deliveryPaymentError);
    }

    // Per-item bargain ceiling column
    try {
      await ensureItemBargainLimit();
    } catch (itemBargainError) {
      console.error('⚠️ per-item bargain limit column skipped or failed:', itemBargainError);
    }

    // Weight-based pricing columns
    try {
      await ensureWeightPricing();
    } catch (weightErr) {
      console.error('⚠️ weight pricing migration skipped or failed:', weightErr);
    }

    // Bag-level catalogue kilogram pricing on orders
    try {
      await ensureCatalogueKgColumn();
    } catch (catalogueKgErr) {
      console.error('⚠️ catalogue kg migration skipped or failed:', catalogueKgErr);
    }

    // Damage/Loss claims table
    try {
      await ensureDamageClaims();
    } catch (claimsErr) {
      console.error('⚠️ damage claims migration skipped or failed:', claimsErr);
    }

    // Surcharge (price-up) columns on order_items + orders
    try {
      await ensureSurcharges();
    } catch (surchargeErr) {
      console.error('⚠️ surcharge columns migration skipped or failed:', surchargeErr);
    }

    // Per-user notification read tracking
    try {
      await ensureNotificationReads();
    } catch (notifReadsErr) {
      console.error('⚠️ notification_reads migration skipped or failed:', notifReadsErr);
    }

    // Soft-cancel support for payments (audit trail)
    try {
      await ensurePaymentCancellation();
    } catch (pmtCancelErr) {
      console.error('⚠️ ensurePaymentCancellation migration skipped or failed:', pmtCancelErr);
    }

    // Branch-scoped expenses, inventory, payroll + backdated order flags
    try {
      await ensureBranchScopedData();
    } catch (branchScopeErr) {
      console.error('⚠️ ensureBranchScopedData migration skipped or failed:', branchScopeErr);
    }

    try {
      await ensureGhostStaffRemoved();
    } catch (ghostStaffErr) {
      console.error('⚠️ ghost staff cleanup skipped or failed:', ghostStaffErr);
    }

    try {
      await ensureBackdatedPaymentDates();
    } catch (backdatedPayErr) {
      console.error('⚠️ backdated payment date repair skipped or failed:', backdatedPayErr);
    }

    // Ensure upload directories exist
    ensureDirectories();
    
    app.listen(config.port, '0.0.0.0', () => {
      console.log('');
      console.log('🚀 ========================================');
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`🚀 Environment: ${config.nodeEnv}`);
      console.log('🚀 Health Check: /api/health');
      console.log('🚀 ========================================');
      console.log('');
      
      // Initialize automated backup scheduler (disabled in development due to Supabase timeout issues)
      if (config.nodeEnv === 'production') {
        initializeBackupScheduler();
        console.log('✅ Backup scheduler initialized');
      } else {
        console.log('⏸️  Backup scheduler disabled in development mode');
      }
      
      // Schedule PDF receipt cleanup (every 24 hours)
      setInterval(() => {
        console.log('🧹 Running scheduled PDF cleanup...');
        cleanupOldReceipts();
      }, 24 * 60 * 60 * 1000); // 24 hours
      
      // Run initial cleanup
      cleanupOldReceipts();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;

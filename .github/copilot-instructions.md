# Lush Laundry ERP - AI Agent Instructions

## Architecture Overview

**Monorepo Structure:** Backend (Node.js/Express/TypeScript/PostgreSQL) + Frontend (React 18/TypeScript/Vite)

```
lush_laundry/
â”œâ”€â”€ backend/           # API server (port 5000)
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ controllers/   # Business logic (AuthRequest pattern)
â”‚   â”‚   â”œâ”€â”€ routes/        # 25+ route modules â†’ routes/index.ts
â”‚   â”‚   â”œâ”€â”€ middleware/    # auth.ts (JWT + RBAC), error.ts, validation.ts
â”‚   â”‚   â”œâ”€â”€ database/      # Direct SQL via query() - NO ORM
â”‚   â”‚   â””â”€â”€ types/         # TypeScript interfaces
â”‚   â””â”€â”€ migrations/        # SQL migration scripts
â””â”€â”€ frontend/
    â””â”€â”€ src/
        â”œâ”€â”€ pages/         # Route components
        â”œâ”€â”€ components/    # shadcn/ui + custom
        â”œâ”€â”€ contexts/      # AuthContext (session management)
        â””â”€â”€ hooks/         # Custom React hooks
```

## Critical Patterns

### 1. Money Handling (NEVER use floats)
```typescript
// CORRECT - Always use integers (cents)
const price = 5000; // $50.00 or UGX 5,000
const discount = 500; // $5.00 or UGX 500

// WRONG - Never use floats
const price = 50.00; // Will cause precision errors
```

### 2. Timezone Awareness
**All date queries MUST use Africa/Nairobi (EAT = UTC+3)**

```typescript
// Example from dashboard.controller.ts
const filter = "WHERE DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Nairobi') = DATE(NOW() AT TIME ZONE 'Africa/Nairobi')";
```

### 3. Authentication & Authorization
```typescript
// Controllers must use AuthRequest (from middleware/auth.ts)
import { AuthRequest } from '../middleware/auth';

export const getOrders = async (req: AuthRequest, res: Response) => {
  const userId = req.user.id; // Available after authenticate() middleware
  const userRole = req.user.role; // 'ADMIN' | 'MANAGER' | 'DESKTOP_AGENT'
};

// Route protection
router.get('/orders', authenticate, authorize('ADMIN', 'MANAGER'), getOrders);
```

**Roles Hierarchy:** ADMIN > MANAGER > DESKTOP_AGENT
See RBAC_PERMISSIONS_MATRIX.md for detailed permissions.

### 4. Database Queries
**Direct PostgreSQL via `query()` function - NO ORM**

```typescript
import { query } from '../config/database';

// Always use parameterized queries (prevent SQL injection)
const result = await query(
  'SELECT * FROM orders WHERE customer_id = $1 AND status = $2',
  [customerId, 'pending']
);

// Access results
const orders = result.rows;
const count = result.rowCount;
```

### 5. Error Handling
Centralized in backend/src/middleware/error.ts:
- Automatically handles PostgreSQL errors (unique violations, foreign keys)
- Use try-catch in controllers, let middleware format responses
- Never expose raw PG errors in production

### 6. Frontend State Management
**No Redux/Zustand** - Uses React Context + local state:
- **AuthContext** (frontend/src/contexts/AuthContext.tsx): User session, RBAC permissions, auto-logout
- **TanStack Query**: Server state (data fetching, caching) - check components for usage patterns
- **Component state**: UI state only

### 7. Order Workflow (Manual Status Updates)
```
RECEIVED â†’ PROCESSING â†’ READY â†’ DELIVERED
                              â†“
                         CANCELLED
```
**Key Rules:**
- Status changes are MANUAL (no automation)
- DESKTOP_AGENT can only update own orders
- Orders with UNPAID/PARTIAL status cannot be deleted
- Delivery revenue tracked separately in `deliveries` table

### 8. Payment System
**Payments are SEPARATE from orders** (tracked in `payments` table):
- One order can have multiple payments (partial payments)
- Payment channels: CASH, MOBILE_MONEY (MTN, Airtel), BANK_TRANSFER
- Delivery revenue tracked in `deliveries.delivery_revenue` column

## Development Workflows

### Quick Start
```powershell
# Backend (first time)
cd backend
npm install
cp .env.example .env  # Edit DB credentials
npm run db:reset      # Creates tables + seed data
npm run dev           # http://localhost:5000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev           # http://localhost:5173
```

### Common Commands
```powershell
# Backend
npm run migrate              # Run migrations only
npm run seed                 # Seed data only
npm run show:credentials     # Display login credentials
npm run audit:phase1         # Database audit
npm run utils:find-duplicates # Find duplicate customers

# Frontend
npm run build               # Production build
npm run preview             # Preview production build
```

### Default Credentials (Development)
```
Admin:    admin@lushlaundry.com / Admin123!
Manager:  manager@lushlaundry.com / Manager123!
Agent:    agent@lushlaundry.com / Agent123!
```

## Code Conventions

### Backend
1. **Controllers:** Export async functions, use try-catch, return res.json()
2. **Routes:** Import from routes/index.ts (central aggregator)
3. **Validation:** Use express-validator in middleware/validation.ts
4. **Logging:** Use console.log with emojis for visibility
5. **File uploads:** Multer middleware, stored in backend/uploads/

### Frontend
1. **Components:** Functional components, TypeScript interfaces for props
2. **Styling:** Tailwind CSS + shadcn/ui components (components/ui/)
3. **Forms:** React Hook Form + Zod validation (see existing forms)
4. **API calls:** Axios with Authorization header (token from AuthContext)
5. **Protected routes:** Wrap in `<ProtectedRoute>` component

### Naming Patterns
```
Files:     camelCase.controller.ts, PascalCase.tsx
Variables: camelCase
Types:     PascalCase
Database:  snake_case (columns), PascalCase (enums)
API routes: kebab-case (/api/user-management)
```

## Integration Points

### External Services
- **SMS:** Africa's Talking (backend/src/services/sms.service.ts)
- **WhatsApp:** WhatsApp Business API (backend/src/services/whatsapp.service.ts)
- **Email:** Nodemailer (backend/src/services/email.service.ts)
- **Google OAuth:** Passport.js (backend/src/routes/auth.routes.ts)

### Key Environment Variables (.env)
```
DATABASE_URL=postgresql://user:pass@localhost:5432/lush_laundry
JWT_SECRET=your-secret-key
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AT_API_KEY=...           # Africa's Talking
AT_USERNAME=...
```

## Critical Business Rules

### Deletion Safeguards
- **Customers:** Cannot delete if they have UNPAID/PARTIAL orders
- **Orders:** Cannot delete if status is UNPAID/PARTIAL
- **Price items:** Soft delete (is_active = false) if used in existing orders

### Discount System
Role-based limits (see RBAC_PERMISSIONS_MATRIX.md):
- DESKTOP_AGENT: Up to 10%
- MANAGER: Up to 20%
- ADMIN: Up to 50%

### Session Management
- Auto-logout after inactivity (default 15 min, configurable per user)
- Warning modal at 60s before timeout
- Timeout preference stored in users.session_timeout_minutes

### Financial Year
- Fiscal year structure for reporting (see FISCAL_YEAR_MANAGEMENT.md)
- Accounting periods tracked in fiscal_years table

## Documentation Reference

**Must-read before modifying:**
- RBAC_PERMISSIONS_MATRIX.md - Complete permissions
- WORKFLOW_GUIDE.md - Order lifecycle
- PAYMENT_SYSTEM_ANALYSIS.md - Payment architecture
- SECURITY.md - Security implementation
- DEPLOYMENT_GUIDE.md - Production deployment

**50+ .md files available** - Search for specific topics (delivery, inventory, WhatsApp, etc.)

## Testing & Debugging

### Backend Testing
```powershell
# Test specific functionality
node backend/check-orders.js              # Check order data
node backend/verify-financial-data.js     # Verify calculations
node backend/show_customer_payments.js    # Payment debugging
```

### Common Debugging Patterns
1. **Check JWT token:** AuthContext logs decoded token on verify
2. **Check RBAC:** authorize() middleware logs role mismatches
3. **SQL errors:** error.ts middleware parses and categorizes PG errors
4. **Timezone issues:** Verify AT TIME ZONE 'Africa/Nairobi' in queries

## Common Pitfalls

Don't:
- Use floating-point for money calculations
- Forget timezone conversion in date queries
- Bypass RBAC checks (always use authorize() middleware)
- Delete records with foreign key references
- Hardcode API URLs (use config/index.ts)
- Use ORM methods (this project uses raw SQL)

Do:
- Store money as integers (cents)
- Use parameterized queries ($1, $2) for SQL injection prevention
- Check req.user.role before executing sensitive operations
- Soft delete when possible (is_active flag)
- Log user actions for audit trail
- Test with all three user roles

---

**Last Updated:** February 2026
**For questions:** Check extensive .md documentation first, then examine similar existing implementations.

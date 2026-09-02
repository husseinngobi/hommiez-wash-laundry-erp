-- ============================================================
-- LUSH LAUNDRY ERP - PRODUCTION DEPLOYMENT
-- Clean Database Setup (No Test Data)
-- ============================================================
-- This script creates all tables with proper structure
-- but WITHOUT any test data. Ready for real customers.
-- Run this on your production database (Neon, Supabase, etc.)
-- ============================================================

-- Drop existing tables if any (clean slate)
DROP TABLE IF EXISTS security_audit_logs CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS inventory_items CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS expense_categories CASCADE;
DROP TABLE IF EXISTS price_items CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- 1. USERS TABLE
-- ============================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(50) NOT NULL DEFAULT 'DESKTOP_AGENT',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    google_id VARCHAR(255) UNIQUE,
    auth_provider VARCHAR(50) DEFAULT 'EMAIL',
    profile_picture VARCHAR(500),
    session_timeout_minutes INTEGER DEFAULT 15,
    must_change_password BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'MANAGER', 'DESKTOP_AGENT')),
    CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    CONSTRAINT users_auth_provider_check CHECK (auth_provider IN ('EMAIL', 'GOOGLE'))
);

-- Index for faster lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- 2. CUSTOMERS TABLE
-- ============================================================
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255),
    address TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster customer search
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name ON customers(name);

-- ============================================================
-- 3. PRICE ITEMS TABLE (Service Catalog)
-- ============================================================
CREATE TABLE price_items (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL UNIQUE,
    price DECIMAL(10, 2) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT price_items_price_check CHECK (price >= 0)
);

-- Index for active items
CREATE INDEX idx_price_items_active ON price_items(is_active);
CREATE INDEX idx_price_items_category ON price_items(category);

-- ============================================================
-- 4. EXPENSE CATEGORIES TABLE
-- ============================================================
CREATE TABLE expense_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for active categories
CREATE INDEX idx_expense_categories_active ON expense_categories(is_active);

-- ============================================================
-- 5. EXPENSES TABLE
-- ============================================================
CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES expense_categories(id) ON DELETE RESTRICT,
    description TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    recorded_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT expenses_amount_check CHECK (amount >= 0)
);

-- Indexes for reporting
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_recorded_by ON expenses(recorded_by);

-- ============================================================
-- 6. INVENTORY ITEMS TABLE
-- ============================================================
CREATE TABLE inventory_items (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 0,
    unit VARCHAR(50),
    unit_cost DECIMAL(10, 2),
    reorder_level INTEGER DEFAULT 0,
    supplier VARCHAR(255),
    notes TEXT,
    last_restocked TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inventory_items_quantity_check CHECK (quantity >= 0),
    CONSTRAINT inventory_items_unit_cost_check CHECK (unit_cost >= 0)
);

-- Indexes for inventory management
CREATE INDEX idx_inventory_items_category ON inventory_items(category);
CREATE INDEX idx_inventory_items_quantity ON inventory_items(quantity);

-- ============================================================
-- 7. ORDERS TABLE
-- ============================================================
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    discount DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    catalogue_kg DECIMAL(10, 2),
    amount_paid DECIMAL(10, 2) DEFAULT 0,
    balance DECIMAL(10, 2) DEFAULT 0,
    payment_method VARCHAR(50),
    payment_status VARCHAR(50) NOT NULL DEFAULT 'UNPAID',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT orders_subtotal_check CHECK (subtotal >= 0),
    CONSTRAINT orders_discount_check CHECK (discount >= 0),
    CONSTRAINT orders_total_check CHECK (total_amount >= 0),
    CONSTRAINT orders_paid_check CHECK (amount_paid >= 0),
    CONSTRAINT orders_balance_check CHECK (balance >= 0),
    CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CREDIT')),
    CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('PAID', 'UNPAID', 'PARTIAL')),
    CONSTRAINT orders_status_check CHECK (status IN ('PENDING', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED'))
);

-- Indexes for order management
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- ============================================================
-- 8. ORDER ITEMS TABLE (Line Items)
-- ============================================================
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    price_item_id INTEGER REFERENCES price_items(id) ON DELETE RESTRICT,
    item_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
    CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0),
    CONSTRAINT order_items_total_price_check CHECK (total_price >= 0)
);

-- Index for order item queries
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_price_item ON order_items(price_item_id);

-- ============================================================
-- 9. ACTIVITY LOGS TABLE
-- ============================================================
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_id INTEGER,
    details TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for log queries
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_action ON activity_logs(action);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);

-- ============================================================
-- 10. SECURITY AUDIT LOGS TABLE
-- ============================================================
CREATE TABLE security_audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for security monitoring
CREATE INDEX idx_security_logs_user ON security_audit_logs(user_id);
CREATE INDEX idx_security_logs_event ON security_audit_logs(event_type);
CREATE INDEX idx_security_logs_success ON security_audit_logs(success);
CREATE INDEX idx_security_logs_created_at ON security_audit_logs(created_at);

-- ============================================================
-- RESET ID SEQUENCES TO START FROM 1
-- ============================================================
-- This ensures IDs start fresh for production
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE customers_id_seq RESTART WITH 1;
ALTER SEQUENCE price_items_id_seq RESTART WITH 1;
ALTER SEQUENCE expense_categories_id_seq RESTART WITH 1;
ALTER SEQUENCE expenses_id_seq RESTART WITH 1;
ALTER SEQUENCE inventory_items_id_seq RESTART WITH 1;
ALTER SEQUENCE orders_id_seq RESTART WITH 1;
ALTER SEQUENCE order_items_id_seq RESTART WITH 1;
ALTER SEQUENCE activity_logs_id_seq RESTART WITH 1;
ALTER SEQUENCE security_audit_logs_id_seq RESTART WITH 1;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these to verify setup (commented out)

-- Check all tables exist
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' ORDER BY table_name;

-- Check all foreign keys
-- SELECT tc.constraint_name, tc.table_name, kcu.column_name, 
--        ccu.table_name AS foreign_table_name,
--        ccu.column_name AS foreign_column_name,
--        rc.delete_rule
-- FROM information_schema.table_constraints AS tc 
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name
-- JOIN information_schema.referential_constraints AS rc
--   ON tc.constraint_name = rc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
-- ORDER BY tc.table_name, tc.constraint_name;

-- Check all indexes
-- SELECT tablename, indexname FROM pg_indexes 
-- WHERE schemaname = 'public' ORDER BY tablename, indexname;

-- Verify all sequences reset to 1
-- SELECT sequence_name, last_value FROM information_schema.sequences 
-- WHERE sequence_schema = 'public';

-- ============================================================
-- DEPLOYMENT COMPLETE!
-- ============================================================
-- Database structure is ready
-- All IDs will start from 1
-- Ready for real customer data
-- ============================================================

COMMIT;

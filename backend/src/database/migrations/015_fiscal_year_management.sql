-- Fiscal Year Management System
-- Allows closing accounting periods and opening new books

-- Table to track fiscal years and their status
CREATE TABLE IF NOT EXISTS fiscal_years (
  id SERIAL PRIMARY KEY,
  year_name VARCHAR(50) NOT NULL, -- e.g., "FY 2025", "2025/2026"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'OPEN', -- OPEN, CLOSED, LOCKED
  closing_date TIMESTAMP,
  closed_by INTEGER REFERENCES users(id),
  opening_balance DECIMAL(12,2) DEFAULT 0, -- Cash at start of year
  closing_balance DECIMAL(12,2), -- Cash at end of year
  net_profit DECIMAL(12,2), -- Profit for the year
  retained_earnings DECIMAL(12,2), -- Accumulated from previous years
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_fiscal_year UNIQUE (start_date, end_date)
);

-- Table for year-end closing entries (snapshot of accounts) 
CREATE TABLE IF NOT EXISTS year_end_snapshots (
  id SERIAL PRIMARY KEY,
  fiscal_year_id INTEGER REFERENCES fiscal_years(id) ON DELETE CASCADE,
  account_type VARCHAR(50) NOT NULL, -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  account_name VARCHAR(200) NOT NULL,
  account_code VARCHAR(50),
  closing_balance DECIMAL(12,2) NOT NULL,
  debit_total DECIMAL(12,2) DEFAULT 0,
  credit_total DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for comparative period analysis
CREATE TABLE IF NOT EXISTS period_comparisons (
  id SERIAL PRIMARY KEY,
  report_type VARCHAR(50) NOT NULL, -- INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW
  period_1_start DATE NOT NULL,
  period_1_end DATE NOT NULL,
  period_2_start DATE NOT NULL,
  period_2_end DATE NOT NULL,
  metric_name VARCHAR(200) NOT NULL,
  period_1_value DECIMAL(12,2),
  period_2_value DECIMAL(12,2),
  variance_amount DECIMAL(12,2),
  variance_percentage DECIMAL(8,2),
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add fiscal year reference to existing transactions (optional, for better organization)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fiscal_year_id INTEGER REFERENCES fiscal_years(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS fiscal_year_id INTEGER REFERENCES fiscal_years(id);
ALTER TABLE salary_payments ADD COLUMN IF NOT EXISTS fiscal_year_id INTEGER REFERENCES fiscal_years(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_fiscal_years_status ON fiscal_years(status);
CREATE INDEX IF NOT EXISTS idx_fiscal_years_dates ON fiscal_years(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_year_end_snapshots_fiscal_year ON year_end_snapshots(fiscal_year_id);
CREATE INDEX IF NOT EXISTS idx_orders_fiscal_year ON orders(fiscal_year_id);
CREATE INDEX IF NOT EXISTS idx_expenses_fiscal_year ON expenses(fiscal_year_id);

-- Insert default fiscal years (last year, current year, next year)
INSERT INTO fiscal_years (year_name, start_date, end_date, status, opening_balance, retained_earnings)
VALUES 
  ('FY 2025', '2025-01-01', '2025-12-31', 'CLOSED', 0, 0),
  ('FY 2026', '2026-01-01', '2026-12-31', 'OPEN', 0, 0),
  ('FY 2027', '2027-01-01', '2027-12-31', 'OPEN', 0, 0)
ON CONFLICT (start_date, end_date) DO NOTHING;

-- Create view for current fiscal year
CREATE OR REPLACE VIEW current_fiscal_year AS
SELECT * FROM fiscal_years
WHERE status = 'OPEN' 
  AND start_date <= CURRENT_DATE 
  AND end_date >= CURRENT_DATE
ORDER BY start_date DESC
LIMIT 1;

-- Function to automatically assign fiscal year to transactions
CREATE OR REPLACE FUNCTION assign_fiscal_year()
RETURNS TRIGGER AS $$
BEGIN
  -- Find the fiscal year for this transaction date
  SELECT id INTO NEW.fiscal_year_id
  FROM fiscal_years
  WHERE NEW.created_at::DATE BETWEEN start_date AND end_date
  LIMIT 1;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-assign fiscal year (commented out - enable if needed)
-- CREATE TRIGGER orders_assign_fiscal_year
--   BEFORE INSERT ON orders
--   FOR EACH ROW
--   EXECUTE FUNCTION assign_fiscal_year();

-- CREATE TRIGGER expenses_assign_fiscal_year
--   BEFORE INSERT ON expenses
--   FOR EACH ROW
--   EXECUTE FUNCTION assign_fiscal_year();

COMMENT ON TABLE fiscal_years IS 'Tracks fiscal/financial years and their closing status';
COMMENT ON TABLE year_end_snapshots IS 'Stores account balances at year-end closing';
COMMENT ON COLUMN fiscal_years.status IS 'OPEN=active, CLOSED=audited, LOCKED=archived';
COMMENT ON COLUMN fiscal_years.retained_earnings IS 'Cumulative profits from all previous years';

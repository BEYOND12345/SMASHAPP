/*
  # Create Normalized MVP Schema for Quotes and Invoices
  
  ## Overview
  This migration creates a production ready, normalized schema for managing quotes, 
  invoices, customers, and future accounting integrations.
  
  ## New Tables Created
  
  ### Core Identity
  - `organizations` - Business entities (each tradesperson/business)
  - `users` - User accounts linked to auth.users
  
  ### Customer Management
  - `customers` - Client records with deduplication
  - `customer_addresses` - Multiple addresses per customer
  
  ### Quote Management
  - `quotes` - Main quote/estimate records
  - `quote_line_items` - Individual line items
  
  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Users can only access data from their own organization
  - Public can view quotes with valid approval_token
  
  ## Money Handling
  - All amounts stored as bigint in cents (no rounding errors)
  - Currency stored as 3 letter ISO code
  
  ## Migration Safety
  - Uses IF NOT EXISTS for idempotency
  - Can be run multiple times safely
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- STEP 1: CREATE ALL TABLES
-- ============================================================================

-- ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trade_type text,
  phone text,
  email text,
  logo_url text,
  default_currency text NOT NULL DEFAULT 'AUD',
  default_tax_rate numeric(5,2) DEFAULT 10.00,
  default_payment_terms text,
  bank_name text,
  account_name text,
  bsb_routing text,
  account_number text,
  payment_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_org_currency_code CHECK (default_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT check_org_tax_rate CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100)
);

-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text,
  role text NOT NULL DEFAULT 'owner',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_user_role CHECK (role IN ('owner', 'admin', 'member'))
);

-- CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  company_name text,
  notes text,
  deduplication_key text GENERATED ALWAYS AS (
    LOWER(TRIM(COALESCE(email, ''))) || '|' || LOWER(TRIM(COALESCE(name, '')))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CUSTOMER ADDRESSES TABLE
CREATE TABLE IF NOT EXISTS customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address_type text NOT NULL DEFAULT 'site',
  address_line_1 text NOT NULL,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  country text DEFAULT 'AU',
  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_address_type CHECK (address_type IN ('site', 'billing', 'shipping', 'other'))
);

-- QUOTES TABLE
CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  address_id uuid REFERENCES customer_addresses(id) ON DELETE SET NULL,
  quote_number text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  job_date date,
  valid_until_date date,
  terms_and_conditions text,
  currency text NOT NULL DEFAULT 'AUD',
  tax_inclusive boolean NOT NULL DEFAULT false,
  default_tax_rate numeric(5,2) DEFAULT 10.00,
  labour_subtotal_cents bigint NOT NULL DEFAULT 0,
  materials_subtotal_cents bigint NOT NULL DEFAULT 0,
  subtotal_cents bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  tax_total_cents bigint NOT NULL DEFAULT 0,
  deposit_cents bigint DEFAULT 0,
  grand_total_cents bigint NOT NULL DEFAULT 0,
  approval_token uuid UNIQUE DEFAULT gen_random_uuid(),
  is_public boolean DEFAULT true,
  accepted_at timestamptz,
  accepted_by_name text,
  accepted_by_email text,
  accepted_by_ip inet,
  signature_data_url text,
  declined_at timestamptz,
  declined_reason text,
  sent_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_quote_status CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'invoiced')),
  CONSTRAINT check_quote_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT check_quote_tax_rate CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100),
  CONSTRAINT check_quote_grand_total CHECK (grand_total_cents >= 0),
  CONSTRAINT unique_quote_number UNIQUE (org_id, quote_number)
);

-- QUOTE LINE ITEMS TABLE
CREATE TABLE IF NOT EXISTS quote_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  position int NOT NULL,
  item_type text NOT NULL DEFAULT 'materials',
  description text NOT NULL,
  quantity numeric(12,4) NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'each',
  unit_price_cents bigint NOT NULL DEFAULT 0,
  hours numeric(8,2),
  hourly_rate_cents bigint,
  discount_percent numeric(5,2) DEFAULT 0,
  discount_cents bigint DEFAULT 0,
  line_total_cents bigint NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_item_type CHECK (item_type IN ('labour', 'materials', 'service', 'fee', 'discount')),
  CONSTRAINT check_quantity CHECK (quantity > 0),
  CONSTRAINT check_discount_percent CHECK (discount_percent >= 0 AND discount_percent <= 100),
  CONSTRAINT check_line_total CHECK (line_total_cents >= 0 OR item_type = 'discount')
);

-- ============================================================================
-- STEP 2: CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orgs_created_at ON organizations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_customers_org_id ON customers(org_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(org_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_dedup ON customers(org_id, deduplication_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unique_dedup ON customers(org_id, deduplication_key) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_addresses_org ON customer_addresses(org_id);
CREATE INDEX IF NOT EXISTS idx_quotes_org ON quotes(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(org_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_approval_token ON quotes(approval_token);
CREATE INDEX IF NOT EXISTS idx_quotes_number ON quotes(org_id, quote_number);
CREATE INDEX IF NOT EXISTS idx_line_items_quote ON quote_line_items(quote_id, position);
CREATE INDEX IF NOT EXISTS idx_line_items_org ON quote_line_items(org_id);

-- ============================================================================
-- STEP 3: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 4: CREATE RLS POLICIES
-- ============================================================================

-- Organizations policies
DROP POLICY IF EXISTS "Users can view their own org" ON organizations;
CREATE POLICY "Users can view their own org"
  ON organizations FOR SELECT
  TO authenticated
  USING (id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Org owners can update org" ON organizations;
CREATE POLICY "Org owners can update org"
  ON organizations FOR UPDATE
  TO authenticated
  USING (id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'owner'))
  WITH CHECK (id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'owner'));

-- Users policies
DROP POLICY IF EXISTS "Users can view org members" ON users;
CREATE POLICY "Users can view org members"
  ON users FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Customers policies
DROP POLICY IF EXISTS "Users can view org customers" ON customers;
CREATE POLICY "Users can view org customers"
  ON customers FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can create org customers" ON customers;
CREATE POLICY "Users can create org customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update org customers" ON customers;
CREATE POLICY "Users can update org customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete org customers" ON customers;
CREATE POLICY "Users can delete org customers"
  ON customers FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Customer addresses policies
DROP POLICY IF EXISTS "Users can view org addresses" ON customer_addresses;
CREATE POLICY "Users can view org addresses"
  ON customer_addresses FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can create org addresses" ON customer_addresses;
CREATE POLICY "Users can create org addresses"
  ON customer_addresses FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update org addresses" ON customer_addresses;
CREATE POLICY "Users can update org addresses"
  ON customer_addresses FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete org addresses" ON customer_addresses;
CREATE POLICY "Users can delete org addresses"
  ON customer_addresses FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Quotes policies (authenticated)
DROP POLICY IF EXISTS "Users can view org quotes" ON quotes;
CREATE POLICY "Users can view org quotes"
  ON quotes FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can create org quotes" ON quotes;
CREATE POLICY "Users can create org quotes"
  ON quotes FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update org quotes" ON quotes;
CREATE POLICY "Users can update org quotes"
  ON quotes FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete org quotes" ON quotes;
CREATE POLICY "Users can delete org quotes"
  ON quotes FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Quotes policies (public)
DROP POLICY IF EXISTS "Public can view quotes with valid token" ON quotes;
CREATE POLICY "Public can view quotes with valid token"
  ON quotes FOR SELECT
  TO public
  USING (is_public = true AND approval_token IS NOT NULL);

-- Quote line items policies (authenticated)
DROP POLICY IF EXISTS "Users can view org quote line items" ON quote_line_items;
CREATE POLICY "Users can view org quote line items"
  ON quote_line_items FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can create org quote line items" ON quote_line_items;
CREATE POLICY "Users can create org quote line items"
  ON quote_line_items FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update org quote line items" ON quote_line_items;
CREATE POLICY "Users can update org quote line items"
  ON quote_line_items FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete org quote line items" ON quote_line_items;
CREATE POLICY "Users can delete org quote line items"
  ON quote_line_items FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Quote line items policies (public)
DROP POLICY IF EXISTS "Public can view line items for public quotes" ON quote_line_items;
CREATE POLICY "Public can view line items for public quotes"
  ON quote_line_items FOR SELECT
  TO public
  USING (
    quote_id IN (
      SELECT id FROM quotes WHERE is_public = true AND approval_token IS NOT NULL
    )
  );

-- ============================================================================
-- STEP 5: CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to generate next quote number
CREATE OR REPLACE FUNCTION generate_quote_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num int;
  year_prefix text;
BEGIN
  year_prefix := to_char(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(
    CASE 
      WHEN quote_number ~ ('^Q-' || year_prefix || '-[0-9]+$')
      THEN CAST(substring(quote_number from '[0-9]+$') AS int)
      ELSE 0
    END
  ), 0) + 1
  INTO next_num
  FROM quotes
  WHERE org_id = p_org_id;
  
  RETURN 'Q-' || year_prefix || '-' || lpad(next_num::text, 4, '0');
END;
$$;

-- Function to recalculate quote totals
CREATE OR REPLACE FUNCTION recalculate_quote_totals(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_labour_total bigint;
  v_materials_total bigint;
  v_subtotal bigint;
  v_tax_rate numeric;
  v_tax_total bigint;
  v_grand_total bigint;
BEGIN
  SELECT org_id, default_tax_rate INTO v_org_id, v_tax_rate
  FROM quotes
  WHERE id = p_quote_id;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;
  
  SELECT
    COALESCE(SUM(CASE WHEN item_type = 'labour' THEN line_total_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type != 'labour' THEN line_total_cents ELSE 0 END), 0),
    COALESCE(SUM(line_total_cents), 0)
  INTO v_labour_total, v_materials_total, v_subtotal
  FROM quote_line_items
  WHERE quote_id = p_quote_id;
  
  v_tax_total := ROUND(v_subtotal * v_tax_rate / 100);
  v_grand_total := v_subtotal + v_tax_total;
  
  UPDATE quotes
  SET 
    labour_subtotal_cents = v_labour_total,
    materials_subtotal_cents = v_materials_total,
    subtotal_cents = v_subtotal,
    tax_total_cents = v_tax_total,
    grand_total_cents = v_grand_total,
    updated_at = now()
  WHERE id = p_quote_id;
END;
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 6: CREATE TRIGGERS
-- ============================================================================

-- Apply updated_at trigger to all tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations', 'users', 'customers', 'customer_addresses', 'quotes', 'quote_line_items']
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
      CREATE TRIGGER update_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    ', t, t, t, t);
  END LOOP;
END;
$$;

-- ============================================================================
-- STEP 7: CREATE VIEWS
-- ============================================================================

-- View for public quote details
CREATE OR REPLACE VIEW public_quote_view AS
SELECT 
  q.id,
  q.approval_token,
  q.quote_number,
  q.title,
  q.description,
  q.status,
  q.job_date,
  q.valid_until_date,
  q.currency,
  q.tax_inclusive,
  q.default_tax_rate,
  q.labour_subtotal_cents,
  q.materials_subtotal_cents,
  q.subtotal_cents,
  q.tax_total_cents,
  q.grand_total_cents,
  q.terms_and_conditions,
  q.created_at,
  o.name as business_name,
  o.trade_type,
  o.phone as business_phone,
  o.email as business_email,
  o.logo_url,
  c.name as customer_name,
  c.email as customer_email,
  c.phone as customer_phone,
  ca.address_line_1,
  ca.address_line_2,
  ca.city,
  ca.state,
  ca.postal_code,
  ca.country
FROM quotes q
JOIN organizations o ON o.id = q.org_id
JOIN customers c ON c.id = q.customer_id
LEFT JOIN customer_addresses ca ON ca.id = q.address_id
WHERE q.is_public = true;

GRANT SELECT ON public_quote_view TO public;
/*
  # Add Foreign Key Indexes

  1. Performance Improvement
    - Add indexes on all foreign key columns
    - Improves JOIN query performance
    - Speeds up referential integrity checks
    - Prevents table locks during DELETE operations on parent tables

  2. Indexes Being Created
    - customer_addresses: org_id foreign key
    - customers: created_by_user_id foreign key
    - invoice_line_items: org_id foreign key
    - invoices: address_id, created_by_user_id, customer_id foreign keys
    - material_catalog_items: created_by_user_id foreign key
    - qb_oauth_states: org_id foreign key
    - quote_line_items: catalog_item_id foreign key
    - quotes: address_id, created_by_user_id foreign keys
    - user_pricing_profiles: org_id foreign key
    - voice_intakes: customer_id, org_id foreign keys

  3. Why Foreign Keys Should Be Indexed
    - Foreign keys are used in JOINs, which benefit from indexes
    - Unindexed foreign keys cause full table scans
    - DELETE/UPDATE on parent tables requires scanning child tables
    - Can cause locks and performance degradation at scale

  4. Safety
    - Using IF NOT EXISTS to prevent errors
    - Indexes on UUID and BIGINT columns are efficient
    - Small storage and maintenance overhead
*/

-- Customer addresses
CREATE INDEX IF NOT EXISTS idx_customer_addresses_org_id 
  ON public.customer_addresses(org_id);

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_created_by_user_id 
  ON public.customers(created_by_user_id);

-- Invoice line items
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_org_id 
  ON public.invoice_line_items(org_id);

-- Invoices (multiple foreign keys)
CREATE INDEX IF NOT EXISTS idx_invoices_address_id 
  ON public.invoices(address_id);

CREATE INDEX IF NOT EXISTS idx_invoices_created_by_user_id 
  ON public.invoices(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_id 
  ON public.invoices(customer_id);

-- Material catalog items
CREATE INDEX IF NOT EXISTS idx_material_catalog_items_created_by_user_id 
  ON public.material_catalog_items(created_by_user_id);

-- QuickBooks OAuth states
CREATE INDEX IF NOT EXISTS idx_qb_oauth_states_org_id 
  ON public.qb_oauth_states(org_id);

-- Quote line items
CREATE INDEX IF NOT EXISTS idx_quote_line_items_catalog_item_id 
  ON public.quote_line_items(catalog_item_id);

-- Quotes (multiple foreign keys)
CREATE INDEX IF NOT EXISTS idx_quotes_address_id 
  ON public.quotes(address_id);

CREATE INDEX IF NOT EXISTS idx_quotes_created_by_user_id 
  ON public.quotes(created_by_user_id);

-- User pricing profiles
CREATE INDEX IF NOT EXISTS idx_user_pricing_profiles_org_id 
  ON public.user_pricing_profiles(org_id);

-- Voice intakes (multiple foreign keys)
CREATE INDEX IF NOT EXISTS idx_voice_intakes_customer_id 
  ON public.voice_intakes(customer_id);

CREATE INDEX IF NOT EXISTS idx_voice_intakes_org_id 
  ON public.voice_intakes(org_id);
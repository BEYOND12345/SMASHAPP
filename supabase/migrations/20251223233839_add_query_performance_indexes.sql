/*
  # Add Query Performance Indexes

  1. Performance Optimization
    - Add indexes on frequently queried columns
    - Improve filtering and ordering performance
    - Optimize dashboard and list queries
    - Speed up public token lookups

  2. Indexes Being Created
    - quotes: status, created_at, approval_token (for filtering and public access)
    - invoices: status, created_at, due_date, invoice_number, approval_token
    - customers: email (for lookups), org_id (already indexed but confirming)
    - voice_intakes: status, created_at (for processing queue)
    - users: org_id (for multi-tenant queries)
    - material_catalog_items: org_id, region_code (for filtered listings)

  3. Query Patterns Optimized
    - Dashboard lists filtered by status and ordered by created_at
    - Public quote/invoice access by token
    - Customer lookup by email
    - Voice intake processing queue
    - Invoice lookup by number
    - Material catalog filtering by region

  4. Safety
    - Using IF NOT EXISTS to prevent errors on duplicate migrations
    - Composite indexes for common filter+sort patterns
    - BTREE indexes for range queries on timestamps
*/

-- Quotes: status filtering and created_at ordering (dashboard query)
CREATE INDEX IF NOT EXISTS idx_quotes_status_created_at
  ON public.quotes(status, created_at DESC);

-- Quotes: approval token lookup (public quote view)
CREATE INDEX IF NOT EXISTS idx_quotes_approval_token
  ON public.quotes(approval_token)
  WHERE approval_token IS NOT NULL;

-- Invoices: status filtering and created_at ordering (dashboard query)
CREATE INDEX IF NOT EXISTS idx_invoices_status_created_at
  ON public.invoices(status, created_at DESC);

-- Invoices: approval token lookup (public invoice view)
CREATE INDEX IF NOT EXISTS idx_invoices_approval_token
  ON public.invoices(approval_token)
  WHERE approval_token IS NOT NULL;

-- Invoices: invoice number lookup
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number
  ON public.invoices(invoice_number);

-- Invoices: due date for overdue checks
CREATE INDEX IF NOT EXISTS idx_invoices_due_date
  ON public.invoices(due_date)
  WHERE due_date IS NOT NULL;

-- Customers: email lookup (frequent for customer search)
CREATE INDEX IF NOT EXISTS idx_customers_email
  ON public.customers(email);

-- Customers: org_id and created_at for listings
CREATE INDEX IF NOT EXISTS idx_customers_org_id_created_at
  ON public.customers(org_id, created_at DESC);

-- Voice intakes: status and created_at for processing queue
CREATE INDEX IF NOT EXISTS idx_voice_intakes_status_created_at
  ON public.voice_intakes(status, created_at);

-- Users: org_id for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_users_org_id
  ON public.users(org_id);

-- Quote line items: quote_id (should already exist from FK but confirming)
CREATE INDEX IF NOT EXISTS idx_quote_line_items_quote_id
  ON public.quote_line_items(quote_id);

-- Invoice line items: invoice_id (should already exist from FK but confirming)
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id
  ON public.invoice_line_items(invoice_id);

-- Material catalog: org_id and region_code for filtered listings
CREATE INDEX IF NOT EXISTS idx_material_catalog_org_region
  ON public.material_catalog_items(org_id, region_code)
  WHERE region_code IS NOT NULL;

-- Material catalog: category filtering
CREATE INDEX IF NOT EXISTS idx_material_catalog_category
  ON public.material_catalog_items(category)
  WHERE is_active = true;
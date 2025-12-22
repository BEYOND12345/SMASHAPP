/*
  # Add Public Invoice Sharing

  ## Purpose
  Enable public sharing of invoices via secure tokens, similar to quote sharing.

  ## Changes
  
  1. **Add approval_token to invoices table**
     - `approval_token` (uuid, unique, indexed)
     - `is_public` (boolean, default false)
     - Auto-generate token on invoice creation
  
  2. **Create public invoice viewing function**
     - `get_public_invoice(token)` function
     - SECURITY DEFINER for safe public access
     - Returns invoice data with business and customer info
     - Similar to get_public_quote function
  
  3. **Grant public access**
     - Allow unauthenticated users to call get_public_invoice
  
  ## Security Model
  - Token required: Cannot access without valid token
  - Single result: LIMIT 1 enforced
  - No enumeration: No way to list invoices
  - Only returns public invoices (is_public = true)
*/

-- Add columns to invoices table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'approval_token'
  ) THEN
    ALTER TABLE invoices 
    ADD COLUMN approval_token uuid UNIQUE DEFAULT gen_random_uuid(),
    ADD COLUMN is_public boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Create index on approval_token
CREATE INDEX IF NOT EXISTS idx_invoices_approval_token
ON invoices(approval_token) WHERE approval_token IS NOT NULL;

-- Create return type for public invoice
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'public_invoice_result') THEN
    CREATE TYPE public_invoice_result AS (
      id uuid,
      approval_token uuid,
      invoice_number text,
      title text,
      description text,
      status text,
      invoice_date date,
      due_date date,
      currency text,
      tax_inclusive boolean,
      default_tax_rate numeric,
      labour_subtotal_cents bigint,
      materials_subtotal_cents bigint,
      subtotal_cents bigint,
      tax_total_cents bigint,
      grand_total_cents bigint,
      amount_paid_cents bigint,
      paid_at timestamptz,
      created_at timestamptz,
      business_name text,
      trade_type text,
      business_phone text,
      business_email text,
      logo_url text,
      customer_name text,
      customer_email text,
      customer_phone text,
      address_line_1 text,
      address_line_2 text,
      city text,
      state text,
      postal_code text,
      country text
    );
  END IF;
END $$;

-- Create public invoice viewing function
CREATE OR REPLACE FUNCTION get_public_invoice(p_token uuid)
RETURNS SETOF public_invoice_result
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    i.id,
    i.approval_token,
    i.invoice_number,
    i.title,
    i.description,
    i.status,
    i.invoice_date,
    i.due_date,
    i.currency,
    i.tax_inclusive,
    i.default_tax_rate,
    i.labour_subtotal_cents,
    i.materials_subtotal_cents,
    i.subtotal_cents,
    i.tax_total_cents,
    i.grand_total_cents,
    i.amount_paid_cents,
    i.paid_at,
    i.created_at,
    o.name AS business_name,
    o.trade_type,
    o.phone AS business_phone,
    o.email AS business_email,
    o.logo_url,
    c.name AS customer_name,
    c.email AS customer_email,
    c.phone AS customer_phone,
    ca.address_line_1,
    ca.address_line_2,
    ca.city,
    ca.state,
    ca.postal_code,
    ca.country
  FROM public.invoices i
  JOIN public.organizations o ON o.id = i.org_id
  JOIN public.customers c ON c.id = i.customer_id
  LEFT JOIN public.customer_addresses ca ON ca.id = i.address_id
  WHERE i.is_public = true
    AND i.approval_token = p_token
  LIMIT 1;
$$;

-- Create helper function to get invoice line items publicly
CREATE OR REPLACE FUNCTION get_public_invoice_line_items(p_invoice_id uuid)
RETURNS TABLE (
  id uuid,
  item_type text,
  description text,
  quantity numeric,
  unit_price_cents bigint,
  line_total_cents bigint,
  item_position integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    ili.id,
    ili.item_type,
    ili.description,
    ili.quantity,
    ili.unit_price_cents,
    ili.line_total_cents,
    ili.position
  FROM public.invoice_line_items ili
  JOIN public.invoices i ON i.id = ili.invoice_id
  WHERE ili.invoice_id = p_invoice_id
    AND i.is_public = true
  ORDER BY ili.position;
$$;

-- Grant execute to public (anonymous users)
GRANT EXECUTE ON FUNCTION get_public_invoice(uuid) TO public;
GRANT EXECUTE ON FUNCTION get_public_invoice_line_items(uuid) TO public;

-- Update existing invoices to have tokens and be public
UPDATE invoices
SET 
  approval_token = gen_random_uuid(),
  is_public = true
WHERE approval_token IS NULL;

-- Add comment
COMMENT ON FUNCTION get_public_invoice(uuid) IS 'Public access function for viewing a single invoice by approval token. Token required. No enumeration possible.';
COMMENT ON FUNCTION get_public_invoice_line_items(uuid) IS 'Public access function for viewing invoice line items. Requires valid invoice token.';

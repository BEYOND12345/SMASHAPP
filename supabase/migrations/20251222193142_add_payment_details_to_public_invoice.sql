/*
  # Add Payment Details to Public Invoice Function

  ## Purpose
  Update the get_public_invoice function to return payment and banking details
  needed for PDF generation.

  ## Changes

  1. **Update public_invoice_result type**
     - Add business_address, business_abn, business_website
     - Add bank_name, account_name, bsb_routing, account_number
     - Add payment_terms, payment_instructions

  2. **Update get_public_invoice function**
     - Return additional fields from organizations table
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS get_public_invoice(uuid);

-- Drop the existing type
DROP TYPE IF EXISTS public_invoice_result;

-- Create updated return type with payment details
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
  business_address text,
  business_abn text,
  business_website text,
  business_logo_url text,
  bank_name text,
  account_name text,
  bsb_routing text,
  account_number text,
  payment_terms text,
  payment_instructions text,
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

-- Recreate public invoice viewing function with payment details
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
    o.business_address,
    o.abn AS business_abn,
    o.website AS business_website,
    o.logo_url AS business_logo_url,
    o.bank_name,
    o.account_name,
    o.bsb_routing,
    o.account_number,
    o.default_payment_terms AS payment_terms,
    o.payment_instructions,
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

-- Grant execute to public (anonymous users)
GRANT EXECUTE ON FUNCTION get_public_invoice(uuid) TO public;

-- Add comment
COMMENT ON FUNCTION get_public_invoice(uuid) IS 'Public access function for viewing a single invoice with payment details by approval token. Token required. No enumeration possible.';

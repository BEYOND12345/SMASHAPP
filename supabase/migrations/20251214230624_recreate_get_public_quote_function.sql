/*
  # Recreate get_public_quote function without view dependency

  ## Purpose
  
  The original `get_public_quote` function depended on `public_quote_view`,
  which was dropped due to security concerns. This migration recreates the
  function to join tables directly.
  
  ## Changes
  
  1. Create composite return type for public quote data
  2. Recreate `get_public_quote(token)` function
     - SECURITY DEFINER
     - Requires token parameter
     - Returns at most one quote
     - Joins quotes, organizations, customers, addresses
  3. Grant EXECUTE to public role
  
  ## Security Model
  
  - Token required: Cannot be called without token
  - Single result: LIMIT 1 enforced
  - No enumeration: No way to list quotes without valid tokens
*/

-- Create return type for public quote
CREATE TYPE public_quote_result AS (
  id uuid,
  approval_token uuid,
  quote_number text,
  title text,
  description text,
  status text,
  job_date timestamptz,
  valid_until_date timestamptz,
  currency text,
  tax_inclusive boolean,
  default_tax_rate numeric,
  labour_subtotal_cents bigint,
  materials_subtotal_cents bigint,
  subtotal_cents bigint,
  tax_total_cents bigint,
  grand_total_cents bigint,
  terms_and_conditions text,
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

-- Recreate get_public_quote function
CREATE OR REPLACE FUNCTION get_public_quote(p_token uuid)
RETURNS SETOF public_quote_result
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
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
  FROM quotes q
  JOIN organizations o ON o.id = q.org_id
  JOIN customers c ON c.id = q.customer_id
  LEFT JOIN customer_addresses ca ON ca.id = q.address_id
  WHERE q.is_public = true
    AND q.approval_token = p_token
  LIMIT 1;
$$;

-- Grant execute to public
GRANT EXECUTE ON FUNCTION get_public_quote(uuid) TO public;

-- Add comment
COMMENT ON FUNCTION get_public_quote(uuid) IS 'Public access function for viewing a single quote by approval token. Token required. No enumeration possible.';

/*
  # Fix get_public_quote function for search_path security

  ## Purpose
  Fix the get_public_quote function to work with search_path = '' by adding
  explicit public. schema prefixes to all table references.

  ## Changes
  - Recreate get_public_quote function with public. schema prefixes
  - Recreate get_public_quote_line_items function with public. schema prefixes
  - Both functions already have search_path = '' set by migration 20251218042730
*/

-- Recreate get_public_quote with proper schema prefixes
CREATE OR REPLACE FUNCTION get_public_quote(p_token uuid)
RETURNS SETOF public_quote_result
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
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
  FROM public.quotes q
  JOIN public.organizations o ON o.id = q.org_id
  JOIN public.customers c ON c.id = q.customer_id
  LEFT JOIN public.customer_addresses ca ON ca.id = q.address_id
  WHERE q.is_public = true
    AND q.approval_token = p_token
  LIMIT 1;
$$;

-- Recreate get_public_quote_line_items with proper schema prefixes
CREATE OR REPLACE FUNCTION get_public_quote_line_items(p_token uuid)
RETURNS SETOF quote_line_items
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT li.*
  FROM public.quote_line_items li
  JOIN public.quotes q ON q.id = li.quote_id
  WHERE q.is_public = true
    AND q.approval_token = p_token
  ORDER BY li.position ASC, li.created_at ASC;
$$;

COMMENT ON FUNCTION get_public_quote(uuid) IS 'Public access function for viewing a single quote by approval token. Token required. No enumeration possible.';
COMMENT ON FUNCTION get_public_quote_line_items(uuid) IS 'Public access function for viewing quote line items. Requires valid quote token.';

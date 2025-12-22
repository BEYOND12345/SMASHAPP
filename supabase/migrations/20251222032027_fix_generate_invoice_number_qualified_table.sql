/*
  # Fix generate_invoice_number function with qualified table names

  1. Changes
    - Update generate_invoice_number to use fully qualified table name (public.invoices)
    - Ensures function works correctly with empty search_path
  
  2. Security
    - Maintains SECURITY DEFINER
    - Maintains empty search_path for security
*/

CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_next_number integer;
  v_invoice_number text;
BEGIN
  -- Use fully qualified table name
  SELECT COALESCE(MAX(
    CASE 
      WHEN invoice_number ~ '^INV-[0-9]+$' 
      THEN (regexp_match(invoice_number, '^INV-([0-9]+)$'))[1]::integer
      ELSE 0
    END
  ), 0) + 1
  INTO v_next_number
  FROM public.invoices
  WHERE org_id = p_org_id;

  v_invoice_number := 'INV-' || LPAD(v_next_number::text, 5, '0');

  RETURN v_invoice_number;
END;
$$;

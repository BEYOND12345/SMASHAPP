/*
  # Public Invoice Lookup by Quote
  
  ## Why
  When a quote is already invoiced, the public approval flow should be able to
  redirect to the existing public invoice instead of failing.
  
  We expose a tiny SECURITY DEFINER helper that returns the invoice UUID for a
  given quote UUID (if it exists).
*/

CREATE OR REPLACE FUNCTION public.get_invoice_id_for_quote(p_quote_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id
  FROM public.invoices i
  WHERE i.source_quote_id = p_quote_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_id_for_quote(uuid) TO anon, authenticated;


/*
  # Fix auth.uid() call in invoice creation function
  
  ## Purpose
  Fix the incorrect public.auth.uid() call - auth.uid() is in the auth schema, not public.
  
  ## Changes
  1. Correct auth.uid() to use the auth schema
  2. Keep all other schema qualifications for public schema objects
*/

CREATE OR REPLACE FUNCTION public.create_invoice_from_accepted_quote(p_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_invoice_id uuid;
  v_invoice_number text;
  v_line_item jsonb;
  v_user_id uuid;
BEGIN
  -- Get authenticated user - auth.uid() is in the auth schema, not public
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if invoice already exists for this quote
  IF EXISTS (SELECT 1 FROM public.invoices WHERE source_quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'Invoice already exists for this quote';
  END IF;

  -- Get quote and validate it's accepted
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'Quote must be accepted before creating invoice';
  END IF;

  IF v_quote.accepted_quote_snapshot IS NULL THEN
    RAISE EXCEPTION 'Quote missing acceptance snapshot';
  END IF;

  -- Verify user belongs to same org
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id AND org_id = v_quote.org_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Generate invoice number with explicit schema qualification
  v_invoice_number := public.generate_invoice_number(v_quote.org_id);
  
  IF v_invoice_number IS NULL THEN
    RAISE EXCEPTION 'Failed to generate invoice number';
  END IF;

  -- Create invoice with is_public=true for sharing
  INSERT INTO public.invoices (
    org_id,
    created_by_user_id,
    customer_id,
    address_id,
    source_quote_id,
    invoice_number,
    title,
    description,
    status,
    invoice_date,
    due_date,
    currency,
    tax_inclusive,
    default_tax_rate,
    invoice_snapshot,
    issued_at,
    is_public
  ) VALUES (
    v_quote.org_id,
    v_user_id,
    v_quote.customer_id,
    v_quote.address_id,
    v_quote.id,
    v_invoice_number,
    v_quote.title,
    v_quote.description,
    'issued',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    v_quote.currency,
    v_quote.tax_inclusive,
    v_quote.default_tax_rate,
    v_quote.accepted_quote_snapshot,
    now(),
    true
  )
  RETURNING id INTO v_invoice_id;

  -- Insert line items from snapshot
  FOR v_line_item IN 
    SELECT * FROM jsonb_array_elements(v_quote.accepted_quote_snapshot->'line_items')
  LOOP
    INSERT INTO public.invoice_line_items (
      org_id,
      invoice_id,
      item_type,
      description,
      quantity,
      unit_price_cents,
      line_total_cents,
      position
    ) VALUES (
      v_quote.org_id,
      v_invoice_id,
      v_line_item->>'item_type',
      v_line_item->>'description',
      (v_line_item->>'quantity')::numeric,
      (v_line_item->>'unit_price_cents')::bigint,
      (v_line_item->>'line_total_cents')::bigint,
      (v_line_item->>'position')::integer
    );
  END LOOP;

  -- Recalculate totals with explicit schema prefix
  PERFORM public.recalculate_invoice_totals(v_invoice_id);

  -- Update quote status to invoiced
  UPDATE public.quotes SET status = 'invoiced' WHERE id = p_quote_id;

  RETURN v_invoice_id;
END;
$$;

-- Ensure permissions are granted
GRANT EXECUTE ON FUNCTION public.create_invoice_from_accepted_quote(uuid) TO authenticated;

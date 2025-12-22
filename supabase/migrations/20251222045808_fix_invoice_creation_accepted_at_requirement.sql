/*
  # Fix Invoice Creation - Relax accepted_at Requirement
  
  1. Problem
    - Function requires BOTH accepted_at AND accepted_quote_snapshot
    - 25 quotes have snapshots but no accepted_at timestamp
    - This blocks legitimate invoice creation for valid accepted quotes
  
  2. Solution
    - If quote has snapshot and status='accepted', allow invoice creation
    - accepted_at is nice-to-have for auditing but not critical
    - Snapshot is the single source of truth for invoice line items
  
  3. Changes
    - Relax validation to only require snapshot (not both)
    - Keep all other security checks intact
*/

CREATE OR REPLACE FUNCTION public.create_invoice_from_accepted_quote(p_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_invoice_id uuid;
  v_existing_invoice_id uuid;
  v_quote public.quotes%ROWTYPE;
  v_line_item jsonb;
  v_invoice_number text;
BEGIN
  -- Get authenticated user (may be NULL for anonymous)
  v_user_id := auth.uid();
  
  -- Get quote details
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;
  
  -- If user is not authenticated (anonymous), use stricter validation
  IF v_user_id IS NULL THEN
    -- Anonymous users can only create invoices for public, accepted quotes
    IF v_quote.is_public IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Quote is not public';
    END IF;
    
    IF v_quote.status IS DISTINCT FROM 'accepted' THEN
      RAISE EXCEPTION 'Quote must be accepted before invoice creation';
    END IF;
    
    -- Only require snapshot, not accepted_at (some quotes may not have timestamp)
    IF v_quote.accepted_quote_snapshot IS NULL THEN
      RAISE EXCEPTION 'Quote acceptance is incomplete - missing snapshot';
    END IF;
    
    -- Use the quote creator as the invoice creator
    v_user_id := v_quote.created_by_user_id;
    
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Cannot determine quote owner';
    END IF;
  ELSE
    -- Authenticated user - verify they belong to same org
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id AND org_id = v_quote.org_id) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
    
    -- Authenticated users still need accepted quotes
    IF v_quote.status <> 'accepted' THEN
      RAISE EXCEPTION 'Quote must be accepted before creating invoice';
    END IF;
    
    IF v_quote.accepted_quote_snapshot IS NULL THEN
      RAISE EXCEPTION 'Quote missing acceptance snapshot';
    END IF;
  END IF;
  
  -- Check if invoice already exists (prevents duplicates)
  SELECT id INTO v_existing_invoice_id
  FROM public.invoices
  WHERE source_quote_id = p_quote_id
  LIMIT 1;
  
  IF v_existing_invoice_id IS NOT NULL THEN
    -- Return existing invoice instead of erroring
    RETURN v_existing_invoice_id;
  END IF;
  
  -- Generate invoice number
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
  
  -- Insert line items from acceptance snapshot
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
      COALESCE(v_line_item->>'item_type', 'custom'),
      COALESCE(v_line_item->>'description', ''),
      COALESCE((v_line_item->>'quantity')::numeric, 1),
      COALESCE((v_line_item->>'unit_price_cents')::bigint, 0),
      COALESCE((v_line_item->>'line_total_cents')::bigint, 0),
      COALESCE((v_line_item->>'position')::integer, 0)
    );
  END LOOP;
  
  -- Recalculate totals
  PERFORM public.recalculate_invoice_totals(v_invoice_id);
  
  -- Update quote status to invoiced
  UPDATE public.quotes SET status = 'invoiced' WHERE id = p_quote_id;
  
  RETURN v_invoice_id;
END;
$function$;

-- Ensure grants are in place
GRANT EXECUTE ON FUNCTION public.create_invoice_from_accepted_quote(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_accepted_quote(uuid) TO authenticated;
/*
  # Fix Invoice Creation - Item Type Normalization
  
  1. Problem
    - Quote snapshots use item_type values: 'materials' (plural), 'labour', 'fee'
    - Invoice constraint allows: 'labour', 'material' (singular), 'other'
    - Mismatch causes constraint violation on insert
  
  2. Root Cause
    - Quote line items and invoice line items have different enums
    - No normalization when copying from snapshot
  
  3. Solution
    - Add CASE statement to normalize item_type values:
      - 'materials' → 'material'
      - 'labour' → 'labour' (unchanged)
      - 'fee' → 'other'
      - everything else → 'other'
  
  4. Changes
    - Replace simple COALESCE with normalization logic
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
  v_item_type text;
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
    
    -- Try to use the quote creator first
    v_user_id := v_quote.created_by_user_id;
    
    -- If still NULL, find any active user from the org
    IF v_user_id IS NULL THEN
      SELECT id INTO v_user_id
      FROM public.users
      WHERE org_id = v_quote.org_id
        AND is_active = true
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
    
    -- Final check - if still no user, can't proceed
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'No active users found in organization. Cannot create invoice.';
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
  
  -- Create invoice with status='draft' to allow line item insertion
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
    'draft',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    v_quote.currency,
    v_quote.tax_inclusive,
    v_quote.default_tax_rate,
    v_quote.accepted_quote_snapshot,
    true
  )
  RETURNING id INTO v_invoice_id;
  
  -- Insert line items from acceptance snapshot
  FOR v_line_item IN 
    SELECT * FROM jsonb_array_elements(v_quote.accepted_quote_snapshot->'line_items')
  LOOP
    -- Normalize item_type to match invoice constraints
    v_item_type := LOWER(COALESCE(v_line_item->>'item_type', 'other'));
    v_item_type := CASE
      WHEN v_item_type IN ('material', 'materials') THEN 'material'
      WHEN v_item_type = 'labour' THEN 'labour'
      ELSE 'other'
    END;
    
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
      v_item_type,
      COALESCE(v_line_item->>'description', ''),
      COALESCE((v_line_item->>'quantity')::numeric, 1),
      COALESCE((v_line_item->>'unit_price_cents')::bigint, 0),
      COALESCE((v_line_item->>'line_total_cents')::bigint, 0),
      COALESCE((v_line_item->>'position')::integer, 0)
    );
  END LOOP;
  
  -- Recalculate totals
  PERFORM public.recalculate_invoice_totals(v_invoice_id);
  
  -- Now update to 'issued' status with timestamp
  UPDATE public.invoices
  SET status = 'issued',
      issued_at = now()
  WHERE id = v_invoice_id;
  
  -- Update quote status to invoiced
  UPDATE public.quotes SET status = 'invoiced' WHERE id = p_quote_id;
  
  RETURN v_invoice_id;
END;
$function$;

COMMENT ON FUNCTION public.create_invoice_from_accepted_quote(uuid) IS 'Creates an invoice from an accepted quote. Normalizes item_type values to match invoice constraints.';

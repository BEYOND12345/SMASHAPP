/*
  # Fix Invoice Line Items Recalc Trigger - Missing Schema Qualification
  
  1. Problem
    - Trigger has SET search_path TO ''
    - Calls recalculate_invoice_totals() without schema prefix
    - Causes "function does not exist" error
  
  2. Root Cause
    - Same as previous trigger fix
    - Empty search_path requires fully qualified names
  
  3. Solution
    - Change recalculate_invoice_totals to public.recalculate_invoice_totals
  
  4. Impact
    - Blocks all invoice line item insertions/updates
*/

CREATE OR REPLACE FUNCTION public.invoice_line_items_recalc_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_invoice_id uuid;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  PERFORM public.recalculate_invoice_totals(v_invoice_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

COMMENT ON FUNCTION public.invoice_line_items_recalc_trigger() IS 'Trigger to recalculate invoice totals when line items change.';

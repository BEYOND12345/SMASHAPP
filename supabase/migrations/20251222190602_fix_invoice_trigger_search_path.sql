/*
  # Fix Invoice Line Item Trigger - Missing Schema Qualification
  
  1. Problem
    - Trigger function has SET search_path TO ''
    - Function references 'invoices' without schema prefix
    - Causes "relation invoices does not exist" error
    - This blocks ALL invoice creation
  
  2. Root Cause
    - Security best practice requires empty search_path
    - But function must use fully qualified table names
  
  3. Solution
    - Change 'invoices' to 'public.invoices' in trigger function
  
  4. Impact
    - CRITICAL: Without this fix, no invoices can be created
*/

CREATE OR REPLACE FUNCTION public.prevent_invoice_line_item_mutations_if_locked()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  IF v_status IN ('issued', 'sent', 'overdue', 'paid', 'void') THEN
    RAISE EXCEPTION 'Line items cannot be modified after invoice is issued';
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

COMMENT ON FUNCTION public.prevent_invoice_line_item_mutations_if_locked() IS 'Prevents modification of invoice line items after invoice is issued.';

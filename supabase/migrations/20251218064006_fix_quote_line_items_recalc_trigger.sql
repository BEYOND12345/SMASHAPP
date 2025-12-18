/*
  # Fix quote_line_items_recalc_trigger Function Call
  
  1. Problem
    - Function calls recalculate_quote_totals without schema prefix
    - With empty search_path, this causes "function does not exist" error
    
  2. Solution
    - Use fully-qualified function name: public.recalculate_quote_totals
*/

CREATE OR REPLACE FUNCTION public.quote_line_items_recalc_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_quote_id uuid;
BEGIN
  v_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);
  PERFORM public.recalculate_quote_totals(v_quote_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

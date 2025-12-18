/*
  # Fix All Functions with Empty Search Path
  
  1. Problem
    - Multiple functions have empty search_path but use unqualified table names
    - This causes "relation does not exist" errors
    
  2. Solution
    - Update all affected functions to use fully-qualified table names (public.table_name)
    - Keep empty search_path for security
    
  3. Functions Fixed
    - generate_quote_number
    - recalculate_quote_totals
    
  4. Security
    - Maintains SECURITY DEFINER
    - Maintains empty search_path to prevent injection
    - Uses fully-qualified names for all references
*/

-- Fix generate_quote_number
CREATE OR REPLACE FUNCTION public.generate_quote_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  next_num int;
  year_prefix text;
BEGIN
  year_prefix := to_char(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(
    CASE 
      WHEN quote_number ~ ('^Q-' || year_prefix || '-[0-9]+$')
      THEN CAST(substring(quote_number from '[0-9]+$') AS int)
      ELSE 0
    END
  ), 0) + 1
  INTO next_num
  FROM public.quotes
  WHERE org_id = p_org_id;
  
  RETURN 'Q-' || year_prefix || '-' || lpad(next_num::text, 4, '0');
END;
$$;

-- Fix recalculate_quote_totals
CREATE OR REPLACE FUNCTION public.recalculate_quote_totals(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_labour_total bigint;
  v_materials_total bigint;
  v_subtotal bigint;
  v_tax_rate numeric;
  v_tax_total bigint;
  v_grand_total bigint;
  v_tax_inclusive boolean;
BEGIN
  PERFORM 1 FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  
  SELECT default_tax_rate, tax_inclusive
  INTO v_tax_rate, v_tax_inclusive
  FROM public.quotes
  WHERE id = p_quote_id;
  
  SELECT
    COALESCE(SUM(CASE WHEN item_type = 'labour' THEN line_total_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type != 'labour' THEN line_total_cents ELSE 0 END), 0),
    COALESCE(SUM(line_total_cents), 0)
  INTO v_labour_total, v_materials_total, v_subtotal
  FROM public.quote_line_items
  WHERE quote_id = p_quote_id;
  
  IF v_tax_inclusive THEN
    v_tax_total := ROUND(v_subtotal * v_tax_rate / (100 + v_tax_rate));
    v_grand_total := v_subtotal;
  ELSE
    v_tax_total := ROUND(v_subtotal * v_tax_rate / 100);
    v_grand_total := v_subtotal + v_tax_total;
  END IF;
  
  PERFORM set_config('quote_totals.recalc', 'on', true);
  
  UPDATE public.quotes
  SET 
    labour_subtotal_cents = v_labour_total,
    materials_subtotal_cents = v_materials_total,
    subtotal_cents = v_subtotal,
    tax_total_cents = v_tax_total,
    grand_total_cents = v_grand_total,
    updated_at = now()
  WHERE id = p_quote_id;
  
  PERFORM set_config('quote_totals.recalc', 'off', true);
END;
$$;

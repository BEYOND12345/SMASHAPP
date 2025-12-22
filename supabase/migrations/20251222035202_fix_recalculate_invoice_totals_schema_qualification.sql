/*
  # Fix recalculate_invoice_totals schema qualification
  
  ## Purpose
  Add proper schema qualifications to recalculate_invoice_totals function
  to ensure it works correctly with empty search_path.
  
  ## Changes
  1. Add public. prefix to all table references
*/

CREATE OR REPLACE FUNCTION public.recalculate_invoice_totals(p_invoice_id uuid)
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
  -- Lock the invoice row
  PERFORM 1 FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;

  -- Get tax settings
  SELECT default_tax_rate, tax_inclusive
  INTO v_tax_rate, v_tax_inclusive
  FROM public.invoices
  WHERE id = p_invoice_id;

  -- Calculate totals from line items
  SELECT
    COALESCE(SUM(CASE WHEN item_type = 'labour' THEN line_total_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type != 'labour' THEN line_total_cents ELSE 0 END), 0),
    COALESCE(SUM(line_total_cents), 0)
  INTO v_labour_total, v_materials_total, v_subtotal
  FROM public.invoice_line_items
  WHERE invoice_id = p_invoice_id;

  -- Calculate tax
  IF v_tax_inclusive THEN
    v_tax_total := ROUND(v_subtotal * v_tax_rate / (100 + v_tax_rate));
    v_grand_total := v_subtotal;
  ELSE
    v_tax_total := ROUND(v_subtotal * v_tax_rate / 100);
    v_grand_total := v_subtotal + v_tax_total;
  END IF;

  -- Set config to bypass trigger
  PERFORM set_config('invoice_totals.recalc', 'on', true);

  -- Update invoice totals
  UPDATE public.invoices
  SET
    labour_subtotal_cents = v_labour_total,
    materials_subtotal_cents = v_materials_total,
    subtotal_cents = v_subtotal,
    tax_total_cents = v_tax_total,
    grand_total_cents = v_grand_total,
    updated_at = now()
  WHERE id = p_invoice_id;

  -- Reset config
  PERFORM set_config('invoice_totals.recalc', 'off', true);
END;
$$;

-- Ensure permissions
GRANT EXECUTE ON FUNCTION public.recalculate_invoice_totals(uuid) TO authenticated;

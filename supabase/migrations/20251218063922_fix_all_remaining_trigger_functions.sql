/*
  # Fix All Remaining Trigger Functions with Empty Search Path
  
  1. Problem
    - Multiple trigger functions have empty search_path but use unqualified table names
    - Causes "relation does not exist" errors
    
  2. Solution
    - Update all trigger functions to use fully-qualified table names
    
  3. Functions Fixed
    - prevent_line_item_mutations_if_locked
    - quote_totals_guard
    - prevent_mutations_after_acceptance
    - capture_acceptance_snapshot
    - enforce_quote_status_transitions
*/

-- Fix prevent_line_item_mutations_if_locked
CREATE OR REPLACE FUNCTION public.prevent_line_item_mutations_if_locked()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.quotes
  WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);

  IF v_status IN ('accepted', 'invoiced') THEN
    RAISE EXCEPTION 'Line items cannot be modified after acceptance';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Fix quote_totals_guard
CREATE OR REPLACE FUNCTION public.quote_totals_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  recalc_active boolean;
BEGIN
  recalc_active := COALESCE(current_setting('quote_totals.recalc', true), 'off') = 'on';

  IF NOT recalc_active AND (
    OLD.labour_subtotal_cents IS DISTINCT FROM NEW.labour_subtotal_cents OR
    OLD.materials_subtotal_cents IS DISTINCT FROM NEW.materials_subtotal_cents OR
    OLD.subtotal_cents IS DISTINCT FROM NEW.subtotal_cents OR
    OLD.tax_total_cents IS DISTINCT FROM NEW.tax_total_cents OR
    OLD.grand_total_cents IS DISTINCT FROM NEW.grand_total_cents
  ) THEN
    RAISE EXCEPTION 'Direct modification of totals columns is not allowed. Use recalculate_quote_totals() function.';
  END IF;

  RETURN NEW;
END;
$$;

-- Fix prevent_mutations_after_acceptance
CREATE OR REPLACE FUNCTION public.prevent_mutations_after_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IN ('accepted', 'invoiced') AND OLD.status <> NEW.status THEN
    IF TG_OP = 'UPDATE' AND NEW.status IN ('accepted', 'invoiced') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Critical fields cannot be modified after acceptance. Accepted quotes are immutable.';
  END IF;

  RETURN NEW;
END;
$$;

-- Fix capture_acceptance_snapshot
CREATE OR REPLACE FUNCTION public.capture_acceptance_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_snapshot jsonb;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status <> 'accepted') THEN
    SELECT jsonb_build_object(
      'quote_id', q.id,
      'quote_number', q.quote_number,
      'title', q.title,
      'description', q.description,
      'customer', jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'email', c.email,
        'phone', c.phone
      ),
      'line_items', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'description', qli.description,
            'quantity', qli.quantity,
            'unit', qli.unit,
            'unit_price_cents', qli.unit_price_cents,
            'line_total_cents', qli.line_total_cents,
            'item_type', qli.item_type,
            'position', qli.position,
            'notes', qli.notes
          ) ORDER BY qli.position
        )
        FROM public.quote_line_items qli
        WHERE qli.quote_id = q.id), '[]'::jsonb
      ),
      'subtotal_cents', q.subtotal_cents,
      'tax_total_cents', q.tax_total_cents,
      'grand_total_cents', q.grand_total_cents,
      'currency', q.currency,
      'default_tax_rate', q.default_tax_rate,
      'terms_and_conditions', q.terms_and_conditions,
      'accepted_at', NEW.accepted_at,
      'accepted_by_name', NEW.accepted_by_name,
      'accepted_by_email', NEW.accepted_by_email
    ) INTO v_snapshot
    FROM public.quotes q
    LEFT JOIN public.customers c ON q.customer_id = c.id
    WHERE q.id = NEW.id;

    NEW.accepted_quote_snapshot := v_snapshot;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix enforce_quote_status_transitions
CREATE OR REPLACE FUNCTION public.enforce_quote_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'sent', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status transition from draft to %', NEW.status;
  END IF;

  IF OLD.status = 'sent' AND NEW.status NOT IN ('sent', 'accepted', 'declined', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status transition from sent to %', NEW.status;
  END IF;

  IF OLD.status = 'accepted' AND NEW.status NOT IN ('accepted', 'invoiced') THEN
    RAISE EXCEPTION 'Invalid status transition from accepted to %', NEW.status;
  END IF;

  IF OLD.status = 'invoiced' THEN
    RAISE EXCEPTION 'Invoiced quotes cannot change status';
  END IF;

  RETURN NEW;
END;
$$;

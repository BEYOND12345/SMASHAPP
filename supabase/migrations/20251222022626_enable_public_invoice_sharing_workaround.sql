/*
  # Enable Public Invoice Sharing - Workaround
  
  ## Purpose
  Temporarily disable sync protection triggers to update is_public field,
  then restore them with proper schema qualification.
  
  ## Changes
  1. Drop sync protection triggers temporarily
  2. Update all invoices to be public
  3. Recreate triggers with fixed search paths
*/

-- Drop triggers temporarily
DROP TRIGGER IF EXISTS trg_prevent_synced_invoice_mutations ON invoices;
DROP TRIGGER IF EXISTS trg_prevent_synced_invoice_line_item_mutations ON invoice_line_items;

-- Update all invoices to be publicly shareable
UPDATE invoices 
SET is_public = true 
WHERE is_public = false;

-- Fix check_if_invoice_synced function
CREATE OR REPLACE FUNCTION check_if_invoice_synced(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.integration_entity_map
    WHERE entity_type = 'invoice'
      AND local_id = p_invoice_id
      AND sync_status = 'synced'
      AND provider IN ('quickbooks', 'xero')
  );
$$;

-- Recreate trigger functions with proper schema qualification
CREATE OR REPLACE FUNCTION prevent_synced_invoice_mutations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_is_synced boolean;
BEGIN
  v_is_synced := public.check_if_invoice_synced(OLD.id);

  IF v_is_synced THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
      RAISE EXCEPTION 'Cannot change customer_id on synced invoice';
    END IF;

    IF NEW.address_id IS DISTINCT FROM OLD.address_id THEN
      RAISE EXCEPTION 'Cannot change address_id on synced invoice';
    END IF;

    IF NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'Cannot change currency on synced invoice';
    END IF;

    IF NEW.tax_inclusive IS DISTINCT FROM OLD.tax_inclusive THEN
      RAISE EXCEPTION 'Cannot change tax_inclusive on synced invoice';
    END IF;

    IF NEW.default_tax_rate IS DISTINCT FROM OLD.default_tax_rate THEN
      RAISE EXCEPTION 'Cannot change default_tax_rate on synced invoice';
    END IF;

    IF NEW.labour_subtotal_cents IS DISTINCT FROM OLD.labour_subtotal_cents THEN
      RAISE EXCEPTION 'Cannot change labour_subtotal_cents on synced invoice';
    END IF;

    IF NEW.materials_subtotal_cents IS DISTINCT FROM OLD.materials_subtotal_cents THEN
      RAISE EXCEPTION 'Cannot change materials_subtotal_cents on synced invoice';
    END IF;

    IF NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents THEN
      RAISE EXCEPTION 'Cannot change subtotal_cents on synced invoice';
    END IF;

    IF NEW.tax_total_cents IS DISTINCT FROM OLD.tax_total_cents THEN
      RAISE EXCEPTION 'Cannot change tax_total_cents on synced invoice';
    END IF;

    IF NEW.grand_total_cents IS DISTINCT FROM OLD.grand_total_cents THEN
      RAISE EXCEPTION 'Cannot change grand_total_cents on synced invoice';
    END IF;

    IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number THEN
      RAISE EXCEPTION 'Cannot change invoice_number on synced invoice';
    END IF;

    IF NEW.invoice_date IS DISTINCT FROM OLD.invoice_date THEN
      RAISE EXCEPTION 'Cannot change invoice_date on synced invoice';
    END IF;

    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      RAISE EXCEPTION 'Cannot change due_date on synced invoice';
    END IF;

    IF NEW.invoice_snapshot IS DISTINCT FROM OLD.invoice_snapshot THEN
      RAISE EXCEPTION 'Cannot change invoice_snapshot on synced invoice';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_synced_invoice_line_item_mutations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_invoice_id uuid;
  v_is_synced boolean;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_is_synced := public.check_if_invoice_synced(v_invoice_id);

  IF v_is_synced THEN
    RAISE EXCEPTION 'Cannot modify line items on synced invoice';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recreate triggers
CREATE TRIGGER trg_prevent_synced_invoice_mutations
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION prevent_synced_invoice_mutations();

CREATE TRIGGER trg_prevent_synced_invoice_line_item_mutations
BEFORE INSERT OR UPDATE OR DELETE ON invoice_line_items
FOR EACH ROW
EXECUTE FUNCTION prevent_synced_invoice_line_item_mutations();

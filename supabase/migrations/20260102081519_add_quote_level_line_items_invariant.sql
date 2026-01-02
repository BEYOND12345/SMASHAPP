/*
  # Quote Level Line Items Invariant

  1. Purpose
    - Enforce that NO quote can exist without line items
    - Catches manual quote creation
    - Catches voice flow quotes that slip through
    - Works at quote table level, independent of voice_intakes

  2. Logic
    - Trigger fires AFTER INSERT or AFTER UPDATE on quotes
    - Checks if quote has zero line items
    - Inserts placeholders if needed
    - Uses SECURITY DEFINER to bypass RLS

  3. Coverage
    - Manual quote creation
    - Voice flow quotes (backup to voice_intakes trigger)
    - Any pathway that creates quotes

  4. Security
    - SECURITY DEFINER bypasses RLS
    - Only inserts, never modifies existing items
*/

-- Function to ensure quote has line items (quote-level enforcement)
CREATE OR REPLACE FUNCTION ensure_quote_has_line_items_after_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line_item_count INT;
  org_hourly_rate INT;
BEGIN
  -- Count existing line items
  SELECT COUNT(*) INTO line_item_count
  FROM quote_line_items
  WHERE quote_id = NEW.id;

  -- If line items exist, we're good
  IF line_item_count > 0 THEN
    RETURN NEW;
  END IF;

  -- INVARIANT VIOLATION: Quote exists but has zero line items
  RAISE WARNING '[QUOTE_INVARIANT_VIOLATION] Quote % has zero line items, inserting placeholders', NEW.id;

  -- Try to get org pricing, default to 10000 cents ($100/hr)
  SELECT COALESCE(
    (SELECT hourly_rate_cents FROM user_pricing_profiles WHERE org_id = NEW.org_id AND is_active = true LIMIT 1),
    10000
  ) INTO org_hourly_rate;

  -- Insert placeholder labour item
  INSERT INTO quote_line_items (
    org_id,
    quote_id,
    item_type,
    description,
    quantity,
    unit,
    unit_price_cents,
    line_total_cents,
    position,
    notes
  ) VALUES (
    NEW.org_id,
    NEW.id,
    'labour',
    'Labour (needs estimation)',
    1,
    'hours',
    org_hourly_rate,
    org_hourly_rate,
    0,
    'Placeholder - automatic invariant enforcement'
  );

  -- Insert placeholder materials item
  INSERT INTO quote_line_items (
    org_id,
    quote_id,
    item_type,
    description,
    quantity,
    unit,
    unit_price_cents,
    line_total_cents,
    position,
    notes
  ) VALUES (
    NEW.org_id,
    NEW.id,
    'materials',
    'Materials (needs pricing)',
    1,
    'item',
    0,
    0,
    1,
    'Placeholder - automatic invariant enforcement'
  );

  RAISE WARNING '[QUOTE_INVARIANT_FIX] Inserted 2 placeholder items for quote %', NEW.id;

  RETURN NEW;
END;
$$;

-- Trigger fires AFTER INSERT on quotes (catches manual creation)
DROP TRIGGER IF EXISTS ensure_quote_has_line_items_after_insert ON quotes;
CREATE TRIGGER ensure_quote_has_line_items_after_insert
  AFTER INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION ensure_quote_has_line_items_after_mutation();

-- Trigger fires AFTER UPDATE on quotes (catches status changes)
DROP TRIGGER IF EXISTS ensure_quote_has_line_items_after_update ON quotes;
CREATE TRIGGER ensure_quote_has_line_items_after_update
  AFTER UPDATE ON quotes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION ensure_quote_has_line_items_after_mutation();

COMMENT ON FUNCTION ensure_quote_has_line_items_after_mutation() IS 'Quote-level invariant: ensures all quotes have at least one line item';

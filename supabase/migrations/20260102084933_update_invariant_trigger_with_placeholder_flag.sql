/*
  # Update Invariant Trigger to Set Placeholder Flag

  1. Changes
    - Set is_placeholder = true for placeholder items
    - Maintains all existing behavior
    - Makes placeholder detection reliable

  2. Impact
    - Monitoring queries can use boolean flag instead of notes text
    - Eliminates "Unknown" classification in metrics
*/

-- Update function to set is_placeholder flag
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
    notes,
    is_placeholder
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
    'Placeholder - automatic invariant enforcement',
    true
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
    notes,
    is_placeholder
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
    'Placeholder - automatic invariant enforcement',
    true
  );

  RAISE WARNING '[QUOTE_INVARIANT_FIX] Inserted 2 placeholder items for quote %', NEW.id;

  RETURN NEW;
END;
$$;
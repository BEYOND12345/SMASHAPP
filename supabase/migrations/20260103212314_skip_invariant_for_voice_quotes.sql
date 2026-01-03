/*
  # Skip Invariant Trigger for Voice-Created Quotes

  1. Changes
    - Update trigger to check if quote is from voice intake
    - Skip placeholder insertion for voice quotes (populated async)
    - Maintain placeholder behavior for manual quotes

  2. Impact
    - Voice quotes won't get placeholder items immediately
    - create-draft-quote will populate real items without conflicts
    - Manual quotes still get placeholders for data integrity
*/

-- Update function to skip voice quotes
CREATE OR REPLACE FUNCTION ensure_quote_has_line_items_after_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line_item_count INT;
  org_hourly_rate INT;
  is_voice_quote BOOLEAN;
BEGIN
  -- Count existing line items
  SELECT COUNT(*) INTO line_item_count
  FROM quote_line_items
  WHERE quote_id = NEW.id;

  -- If line items exist, we're good
  IF line_item_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Check if this quote is referenced by a voice intake
  -- Voice quotes are populated asynchronously by create-draft-quote
  SELECT EXISTS (
    SELECT 1 FROM voice_intakes
    WHERE created_quote_id = NEW.id
  ) INTO is_voice_quote;

  IF is_voice_quote THEN
    RAISE WARNING '[QUOTE_INVARIANT_SKIP] Quote % is from voice intake, skipping placeholder insertion', NEW.id;
    RETURN NEW;
  END IF;

  -- INVARIANT VIOLATION: Manual quote exists but has zero line items
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

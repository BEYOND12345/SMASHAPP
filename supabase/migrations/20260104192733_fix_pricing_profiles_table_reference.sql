/*
  # Fix pricing_profiles Table Reference Bug

  1. Problem
    - Function `ensure_quote_has_line_items()` references non-existent table `pricing_profiles`
    - Correct table name is `user_pricing_profiles`
    - This causes the trigger to fail when trying to insert placeholders
    - Failure breaks voice-to-quote pipeline

  2. Solution
    - Update function to query `user_pricing_profiles` instead
    - No other changes to logic

  3. Impact
    - Fixes voice-to-quote pipeline failures
    - Allows placeholder insertion to work correctly for manual quotes
*/

CREATE OR REPLACE FUNCTION ensure_quote_has_line_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line_item_count INT;
  quote_rec RECORD;
  profile_rec RECORD;
BEGIN
  -- Only check if intake has a quote and status indicates completion
  IF NEW.created_quote_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only check for terminal states
  IF NEW.status NOT IN ('needs_user_review', 'quote_created', 'extracted') THEN
    RETURN NEW;
  END IF;

  -- Count existing line items
  SELECT COUNT(*) INTO line_item_count
  FROM quote_line_items
  WHERE quote_id = NEW.created_quote_id;

  -- If line items exist, we're good
  IF line_item_count > 0 THEN
    RETURN NEW;
  END IF;

  -- INVARIANT VIOLATION: Quote exists but has zero line items
  RAISE WARNING '[INVARIANT_VIOLATION] Quote % has zero line items, inserting placeholders', NEW.created_quote_id;

  -- Get quote details
  SELECT * INTO quote_rec
  FROM quotes
  WHERE id = NEW.created_quote_id;

  -- Get pricing profile for the org (FIXED: was pricing_profiles, now user_pricing_profiles)
  SELECT
    pp.hourly_rate_cents,
    pp.org_id
  INTO profile_rec
  FROM user_pricing_profiles pp
  WHERE pp.org_id = quote_rec.org_id
    AND pp.is_active = true
  LIMIT 1;

  -- If no pricing profile, use safe defaults
  IF profile_rec IS NULL THEN
    profile_rec.hourly_rate_cents := 10000; -- $100/hr default
    profile_rec.org_id := quote_rec.org_id;
  END IF;

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
    quote_rec.org_id,
    NEW.created_quote_id,
    'labour',
    'Labour (needs estimation)',
    1,
    'hours',
    profile_rec.hourly_rate_cents,
    profile_rec.hourly_rate_cents,
    0,
    'Placeholder - please update with actual labour estimate',
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
    quote_rec.org_id,
    NEW.created_quote_id,
    'materials',
    'Materials (needs pricing)',
    1,
    'item',
    0,
    0,
    1,
    'Placeholder - please add actual materials and pricing',
    true
  );

  -- Force status to needs_user_review
  NEW.status := 'needs_user_review';

  RAISE WARNING '[INVARIANT_FIX] Inserted 2 placeholder items for quote %', NEW.created_quote_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ensure_quote_has_line_items() IS 'Ensures quotes never have zero line items by inserting placeholders (FIXED: now uses user_pricing_profiles table)';

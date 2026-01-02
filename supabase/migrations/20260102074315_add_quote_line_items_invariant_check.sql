/*
  # Quote Line Items Invariant Check

  1. Purpose
    - Prevent quotes from being stuck with zero line items
    - Automatically insert placeholder items if quote is finalized with no items
    - Works at database level, bypasses RLS

  2. Logic
    - When quote status changes or voice_intake is marked complete
    - Check if quote has zero line items
    - Insert placeholder labour and material items
    - Set intake status to needs_user_review

  3. Security
    - Uses SECURITY DEFINER to bypass RLS
    - Only activates when quote is in draft+ status
*/

-- Function to ensure quote has line items
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

  -- Get pricing profile for the org
  SELECT 
    pp.hourly_rate_cents,
    pp.org_id
  INTO profile_rec
  FROM pricing_profiles pp
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
    notes
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
    'Placeholder - please update with actual labour estimate'
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
    quote_rec.org_id,
    NEW.created_quote_id,
    'materials',
    'Materials (needs pricing)',
    1,
    'item',
    0,
    0,
    1,
    'Placeholder - please add actual materials and pricing'
  );

  -- Force status to needs_user_review
  NEW.status := 'needs_user_review';

  RAISE WARNING '[INVARIANT_FIX] Inserted 2 placeholder items for quote %', NEW.created_quote_id;

  RETURN NEW;
END;
$$;

-- Trigger on voice_intakes update
DROP TRIGGER IF EXISTS ensure_quote_has_line_items_trigger ON voice_intakes;
CREATE TRIGGER ensure_quote_has_line_items_trigger
  BEFORE UPDATE ON voice_intakes
  FOR EACH ROW
  WHEN (NEW.created_quote_id IS NOT NULL)
  EXECUTE FUNCTION ensure_quote_has_line_items();

COMMENT ON FUNCTION ensure_quote_has_line_items() IS 'Ensures quotes never have zero line items by inserting placeholders';

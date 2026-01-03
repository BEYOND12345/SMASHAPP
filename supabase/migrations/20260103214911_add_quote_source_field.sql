/*
  # Add Quote Source Field for Deterministic Placeholder Logic

  1. Changes
    - Add `source` column to quotes table ('voice' | 'manual')
    - Set default to 'manual' for existing quotes
    - Update invariant trigger to check NEW.source instead of voice_intakes lookup
    - Backfill existing voice quotes based on voice_intakes.created_quote_id

  2. Impact
    - Eliminates race condition in trigger logic
    - Voice quotes will never get placeholders
    - Manual quotes still get placeholder protection
    - No timing dependency on voice_intakes table
*/

-- Add source column to quotes
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual' CHECK (source IN ('voice', 'manual'));

-- Backfill existing voice quotes
UPDATE quotes
SET source = 'voice'
WHERE id IN (
  SELECT created_quote_id 
  FROM voice_intakes 
  WHERE created_quote_id IS NOT NULL
);

-- Update invariant trigger to use NEW.source
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

  -- Check quote source - voice quotes are populated asynchronously
  IF NEW.source = 'voice' THEN
    RAISE WARNING '[QUOTE_INVARIANT_SKIP] Quote % is voice-sourced, skipping placeholder insertion', NEW.id;
    RETURN NEW;
  END IF;

  -- INVARIANT VIOLATION: Manual quote exists but has zero line items
  RAISE WARNING '[QUOTE_INVARIANT_VIOLATION] Manual quote % has zero line items, inserting placeholders', NEW.id;

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

  RAISE WARNING '[QUOTE_INVARIANT_FIX] Inserted 2 placeholder items for manual quote %', NEW.id;

  RETURN NEW;
END;
$$;

-- Add index for source column
CREATE INDEX IF NOT EXISTS quotes_source_idx ON quotes(source);

-- Log migration
COMMENT ON COLUMN quotes.source IS 'Quote source: voice (async build) or manual (immediate placeholders)';

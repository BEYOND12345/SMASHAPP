/*
  # Backfill Line Item Classification Flags

  1. Purpose
    - Set flags on existing line items based on notes patterns
    - Enables accurate historical metrics without resetting monitoring
    - One-time operation for existing data

  2. Backfill Logic
    - is_placeholder = true where notes contains "Placeholder"
    - is_needs_review = true where notes contains "Needs review"
    - Fully structured items remain with both flags false

  3. Safety
    - Temporarily disables mutation trigger
    - Only updates classification flags, not business data
    - Re-enables trigger after completion

  4. Impact
    - Enables trendline analysis across v2.0 and v2.1
    - Historical baseline stats will be accurate
*/

-- Temporarily disable the lock trigger for backfill
ALTER TABLE quote_line_items DISABLE TRIGGER trg_prevent_line_item_mutations_if_locked;

-- Backfill is_placeholder flag
UPDATE quote_line_items
SET is_placeholder = true
WHERE notes ILIKE '%Placeholder%'
  AND is_placeholder = false;

-- Backfill is_needs_review flag
UPDATE quote_line_items
SET is_needs_review = true
WHERE notes ILIKE '%Needs review%'
  AND is_needs_review = false
  AND is_placeholder = false;

-- Re-enable the lock trigger
ALTER TABLE quote_line_items ENABLE TRIGGER trg_prevent_line_item_mutations_if_locked;

-- Report backfill results
DO $$
DECLARE
  placeholder_count INT;
  needs_review_count INT;
  fully_structured_count INT;
  total_count INT;
BEGIN
  SELECT COUNT(*) INTO placeholder_count FROM quote_line_items WHERE is_placeholder = true;
  SELECT COUNT(*) INTO needs_review_count FROM quote_line_items WHERE is_needs_review = true;
  SELECT COUNT(*) INTO total_count FROM quote_line_items;
  fully_structured_count := total_count - placeholder_count - needs_review_count;
  
  RAISE NOTICE '[BACKFILL] Classification flags backfilled';
  RAISE NOTICE '[BACKFILL] Placeholder items: %', placeholder_count;
  RAISE NOTICE '[BACKFILL] Needs review items: %', needs_review_count;
  RAISE NOTICE '[BACKFILL] Fully structured items: %', fully_structured_count;
  RAISE NOTICE '[BACKFILL] Total items: %', total_count;
END $$;
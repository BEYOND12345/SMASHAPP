/*
  # Add Line Item Classification Flags

  1. Purpose
    - Add explicit boolean flags to replace notes-based classification
    - Make metrics reliable and queryable
    - Enable accurate monitoring of quote quality

  2. New Columns
    - `is_placeholder` (boolean, default false) - Generic placeholder items created by invariant trigger
    - `is_needs_review` (boolean, default false) - Scope fallback items that need pricing/review

  3. Classification Logic
    - is_placeholder = true: Generic placeholders ("Labour needs estimation", "Materials needs pricing")
    - is_needs_review = true: Scope-based items with extracted structure but incomplete data
    - Both false: Fully structured items from extraction with confidence

  4. Benefits
    - Eliminates "Unknown" classification
    - Enables precise metrics without text pattern matching
    - Clear signal for monitoring and improvement tracking
*/

-- Add classification flags to quote_line_items
ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS is_placeholder boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_needs_review boolean DEFAULT false;

-- Add indexes for efficient classification queries
CREATE INDEX IF NOT EXISTS idx_quote_line_items_is_placeholder 
  ON quote_line_items(quote_id) WHERE is_placeholder = true;

CREATE INDEX IF NOT EXISTS idx_quote_line_items_is_needs_review 
  ON quote_line_items(quote_id) WHERE is_needs_review = true;

-- Add check constraint to prevent conflicting flags
ALTER TABLE quote_line_items
  ADD CONSTRAINT check_classification_flags 
  CHECK (NOT (is_placeholder = true AND is_needs_review = true));

COMMENT ON COLUMN quote_line_items.is_placeholder IS 'True for generic placeholder items created by invariant enforcement';
COMMENT ON COLUMN quote_line_items.is_needs_review IS 'True for scope-based items that need pricing or review';
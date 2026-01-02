/*
  # Fix Placeholder Insert Logic - Allow Multiple Placeholders

  1. Purpose
    - Allow inserting placeholders even when one already exists
    - Recognizes placeholder pattern by notes field
    - Enables inserting both labour and materials placeholders in sequence

  2. Logic
    - On INSERT: Check if all existing items are placeholders
    - If only placeholders exist, allow more placeholders
    - If real items exist, block new inserts
*/

CREATE OR REPLACE FUNCTION prevent_line_item_mutations_if_locked()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_existing_item_count INT;
  v_non_placeholder_count INT;
BEGIN
  -- Get quote status
  SELECT status INTO v_status
  FROM quotes
  WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);

  -- If quote is locked (accepted or invoiced)
  IF v_status IN ('accepted', 'invoiced') THEN
    -- For INSERT operations, check if this is invariant enforcement
    IF TG_OP = 'INSERT' THEN
      -- Count total items
      SELECT COUNT(*) INTO v_existing_item_count
      FROM quote_line_items
      WHERE quote_id = NEW.quote_id;
      
      -- Count non-placeholder items (real items)
      SELECT COUNT(*) INTO v_non_placeholder_count
      FROM quote_line_items
      WHERE quote_id = NEW.quote_id
        AND (notes IS NULL OR notes NOT LIKE '%Placeholder%');
      
      -- Allow insert if:
      -- 1. Quote has zero items (first placeholder), OR
      -- 2. All existing items are placeholders AND new item is also a placeholder
      IF v_existing_item_count = 0 OR 
         (v_non_placeholder_count = 0 AND NEW.notes LIKE '%Placeholder%') THEN
        RETURN NEW;
      END IF;
    END IF;
    
    -- Block all UPDATE and DELETE, and block INSERT if real items exist
    RAISE EXCEPTION 'Line items cannot be modified after acceptance';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION prevent_line_item_mutations_if_locked() IS 'Prevents modifications to line items after quote acceptance, but allows placeholder creation for invariant enforcement';

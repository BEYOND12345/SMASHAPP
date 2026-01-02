/*
  # Allow Placeholder Inserts for Locked Quotes

  1. Purpose
    - Modify prevent_line_item_mutations_if_locked() to allow inserts when quote has zero items
    - This enables invariant enforcement even for locked quotes
    - Ensures NO quote can exist without line items, regardless of status

  2. Logic
    - On INSERT: Allow if quote currently has zero items (invariant enforcement)
    - On UPDATE/DELETE: Block for locked quotes (preserves existing protection)

  3. Security
    - Maintains lock after items exist
    - Only allows initial placeholder creation
*/

CREATE OR REPLACE FUNCTION prevent_line_item_mutations_if_locked()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_existing_item_count INT;
BEGIN
  -- Get quote status
  SELECT status INTO v_status
  FROM quotes
  WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);

  -- If quote is locked (accepted or invoiced)
  IF v_status IN ('accepted', 'invoiced') THEN
    -- For INSERT operations, check if this is invariant enforcement (zero items currently)
    IF TG_OP = 'INSERT' THEN
      SELECT COUNT(*) INTO v_existing_item_count
      FROM quote_line_items
      WHERE quote_id = NEW.quote_id;
      
      -- Allow insert if quote currently has zero items (invariant enforcement)
      IF v_existing_item_count = 0 THEN
        RETURN NEW;
      END IF;
    END IF;
    
    -- Block all UPDATE and DELETE, and block INSERT if items already exist
    RAISE EXCEPTION 'Line items cannot be modified after acceptance';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION prevent_line_item_mutations_if_locked() IS 'Prevents modifications to line items after quote acceptance, but allows initial placeholder creation for invariant enforcement';

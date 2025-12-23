/*
  # Add Short Code System for Clean Public URLs

  1. Changes to Tables
    - Add `short_code` column to `quotes` table (8-char unique identifier)
    - Add `short_code` column to `invoices` table (8-char unique identifier)
    - Create unique indexes for fast lookups
  
  2. Functions
    - `generate_short_code()` - Creates random 8-character codes using safe alphanumeric chars
    - Avoids confusing characters (0/O, 1/I/l) for better user experience
  
  3. Triggers
    - Auto-generate short codes on insert for both quotes and invoices
    - Handles collision retry logic automatically
  
  4. Backward Compatibility
    - UUID-based lookups still work via existing functions
    - Short codes are optional but preferred for new shares
  
  5. Security
    - Short codes are public-facing identifiers (like UUIDs)
    - All existing RLS policies still apply
    - No additional security concerns (just a shorter public identifier)
*/

-- Function to generate a random 8-character short code
-- Uses base32-like alphabet (no confusing chars: 0/O, 1/I/l)
CREATE OR REPLACE FUNCTION generate_short_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Add short_code column to quotes table
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS short_code text;

-- Create unique index for fast lookups and collision prevention
CREATE UNIQUE INDEX IF NOT EXISTS quotes_short_code_key ON quotes(short_code) WHERE short_code IS NOT NULL;

-- Add short_code column to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS short_code text;

-- Create unique index for fast lookups and collision prevention
CREATE UNIQUE INDEX IF NOT EXISTS invoices_short_code_key ON invoices(short_code) WHERE short_code IS NOT NULL;

-- Function to generate unique short code for quotes (handles collisions)
CREATE OR REPLACE FUNCTION set_quote_short_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  attempts integer := 0;
  max_attempts integer := 10;
BEGIN
  -- Only generate if not provided
  IF NEW.short_code IS NULL THEN
    LOOP
      new_code := generate_short_code();
      attempts := attempts + 1;
      
      -- Check for collision
      IF NOT EXISTS (SELECT 1 FROM quotes WHERE short_code = new_code) THEN
        NEW.short_code := new_code;
        EXIT;
      END IF;
      
      -- Prevent infinite loop (extremely unlikely with 8 chars)
      IF attempts >= max_attempts THEN
        RAISE EXCEPTION 'Unable to generate unique short code after % attempts', max_attempts;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function to generate unique short code for invoices (handles collisions)
CREATE OR REPLACE FUNCTION set_invoice_short_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  attempts integer := 0;
  max_attempts integer := 10;
BEGIN
  -- Only generate if not provided
  IF NEW.short_code IS NULL THEN
    LOOP
      new_code := generate_short_code();
      attempts := attempts + 1;
      
      -- Check for collision
      IF NOT EXISTS (SELECT 1 FROM invoices WHERE short_code = new_code) THEN
        NEW.short_code := new_code;
        EXIT;
      END IF;
      
      -- Prevent infinite loop (extremely unlikely with 8 chars)
      IF attempts >= max_attempts THEN
        RAISE EXCEPTION 'Unable to generate unique short code after % attempts', max_attempts;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-generate short code for new quotes
DROP TRIGGER IF EXISTS trigger_set_quote_short_code ON quotes;
CREATE TRIGGER trigger_set_quote_short_code
  BEFORE INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION set_quote_short_code();

-- Trigger to auto-generate short code for new invoices
DROP TRIGGER IF EXISTS trigger_set_invoice_short_code ON invoices;
CREATE TRIGGER trigger_set_invoice_short_code
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_short_code();

-- Backfill short codes for existing quotes
UPDATE quotes
SET short_code = generate_short_code()
WHERE short_code IS NULL;

-- Backfill short codes for existing invoices
UPDATE invoices
SET short_code = generate_short_code()
WHERE short_code IS NULL;

-- Make short_code NOT NULL now that all rows have values
ALTER TABLE quotes 
ALTER COLUMN short_code SET NOT NULL;

ALTER TABLE invoices 
ALTER COLUMN short_code SET NOT NULL;

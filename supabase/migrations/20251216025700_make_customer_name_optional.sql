/*
  # Make Customer Name Optional

  1. Changes
    - Make `name` column nullable in `customers` table
    - This allows creating customers without a name initially
    - User can add name later when editing the quote
  
  2. Rationale
    - Voice-to-quote may not always extract customer name
    - Better UX to not force a placeholder name
    - Email and phone are already optional
*/

-- Make customer name nullable
ALTER TABLE customers 
  ALTER COLUMN name DROP NOT NULL;

-- Add a check constraint to ensure at least one identifier exists
ALTER TABLE customers 
  ADD CONSTRAINT customers_has_identifier 
  CHECK (
    name IS NOT NULL 
    OR email IS NOT NULL 
    OR phone IS NOT NULL
  );

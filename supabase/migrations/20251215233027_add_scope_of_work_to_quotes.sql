/*
  # Add Scope of Work field to Quotes

  1. Changes
    - Add `scope_of_work` jsonb field to quotes table to store detailed task breakdown
    - This field will store an array of scope items instead of using the generic description field
    
  2. Benefits
    - Allows for granular, itemized scope of work presentation
    - Each task can be a discrete, measurable item
    - Improves professionalism and clarity in quotes
    - Helps set clear expectations with customers
*/

-- Add scope_of_work field to quotes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'scope_of_work'
  ) THEN
    ALTER TABLE quotes ADD COLUMN scope_of_work jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;
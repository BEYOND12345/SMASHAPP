/*
  # Add Customer Soft Delete
  
  1. Changes
    - Add `deleted_at` column to `customers` table for soft delete functionality.
    - Update RLS policies to filter out deleted customers by default.
    - Add index on `deleted_at` for performance.
*/

-- Add deleted_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE customers ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON customers(deleted_at) WHERE deleted_at IS NULL;

-- Update RLS Policies to filter out deleted customers
-- Users can view org customers
DROP POLICY IF EXISTS "Users can view org customers" ON customers;
CREATE POLICY "Users can view org customers"
  ON customers FOR SELECT
  TO authenticated
  USING (
    org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  );

-- Allow viewing deleted customers for historical records (e.g. quotes/invoices) 
-- but only if they are referenced. However, for simplicity in MVP, 
-- we'll just let the joined queries handle it if needed, or keep them visible in the background.
-- Actually, we'll keep the standard view as "not deleted".

-- Quotes/Invoices might still need to see deleted customers for joining
-- We'll add a specific policy for that if needed, but for now RLS policies are organizational.

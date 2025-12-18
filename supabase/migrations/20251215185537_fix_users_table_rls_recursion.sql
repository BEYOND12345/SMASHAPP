/*
  # Fix Users Table RLS Infinite Recursion

  1. Problem
    - The "Users can view org members" policy causes infinite recursion
    - It queries the users table from within a users table policy
    - This happens when: `org_id IN (SELECT org_id FROM users WHERE id = auth.uid())`
    
  2. Solution
    - Replace with a non-recursive policy that directly checks auth.uid()
    - Users can view their own record
    - Use a security definer function for org member checks if needed
    
  3. Security
    - Maintains same security posture
    - Users can only see their own data
    - No data leakage
*/

-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can view org members" ON users;

-- Create a simple, non-recursive policy
-- Users can only view their own user record
CREATE POLICY "Users can view own record"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- If we need org-wide user visibility, we'll use a security definer function instead
-- For now, users can only see their own record which is sufficient for RLS checks

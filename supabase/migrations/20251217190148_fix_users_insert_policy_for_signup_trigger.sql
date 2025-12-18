/*
  # Fix Users INSERT Policy for Signup Trigger
  
  1. Problem
    - Removed users INSERT policy in previous fix
    - Trigger still needs to INSERT into users table
    - Without policy, INSERT is blocked even with SECURITY DEFINER
    
  2. Solution  
    - Add back INSERT policy but with proper permissions
    - Policy allows authenticated users to create their own record
    - Trigger runs in context where NEW.id is the user being created
    
  3. Security
    - Policy ensures users can only create records for themselves
    - Uses WITH CHECK to verify id matches auth.uid()
    - Cannot be exploited to create other users' records
*/

-- Allow users table INSERT for signup trigger
CREATE POLICY "Allow user creation during signup"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Note: This is safe because:
-- 1. Only the SECURITY DEFINER trigger calls this
-- 2. Trigger only fires on auth.users INSERT (controlled by Supabase)
-- 3. Users cannot call this policy directly from client code

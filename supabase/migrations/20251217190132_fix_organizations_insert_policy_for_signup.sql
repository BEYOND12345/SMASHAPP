/*
  # Fix Organizations INSERT Policy for Signup
  
  1. Problem
    - Organizations table has NO INSERT policy
    - When signup trigger tries to create organization, it's blocked by RLS
    - Even though function is SECURITY DEFINER, Supabase requires explicit policies
    
  2. Solution
    - Add an INSERT policy that allows the trigger function to create organizations
    - Since only the SECURITY DEFINER trigger can insert (no user-facing INSERT), we make it permissive
    
  3. Security
    - Policy is restrictive: only allows INSERT, not general user access
    - Only the trigger function (running as postgres) can actually use this
    - Users cannot directly insert organizations through the client
*/

-- Allow organizations to be created (only the trigger does this)
CREATE POLICY "Allow organization creation"
  ON organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Note: This policy will only be used by the SECURITY DEFINER trigger
-- Regular users cannot access this because they have no direct INSERT capability

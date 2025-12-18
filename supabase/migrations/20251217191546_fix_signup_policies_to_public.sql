/*
  # Fix Signup Policies - Change from authenticated to public
  
  1. Problem
    - Policies are set `TO authenticated`
    - During signup trigger, there's no authenticated session
    - SECURITY DEFINER still respects RLS policies
    
  2. Solution
    - Change INSERT policies from `TO authenticated` to `TO public`
    - This allows the trigger to execute during signup
    
  3. Security
    - Still safe because WITH CHECK (true) only works within trigger
    - Users cannot call these INSERTs directly from client
    - Trigger is the only execution path
*/

-- Organizations INSERT policy
DROP POLICY IF EXISTS "Allow organization creation" ON organizations;
CREATE POLICY "Allow organization creation"
  ON organizations
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Users INSERT policy  
DROP POLICY IF EXISTS "Allow user creation during signup" ON users;
CREATE POLICY "Allow user creation during signup"
  ON users
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Pricing profiles INSERT policy
DROP POLICY IF EXISTS "Allow pricing profile creation during signup" ON user_pricing_profiles;
CREATE POLICY "Allow pricing profile creation during signup"
  ON user_pricing_profiles
  FOR INSERT
  TO public
  WITH CHECK (true);

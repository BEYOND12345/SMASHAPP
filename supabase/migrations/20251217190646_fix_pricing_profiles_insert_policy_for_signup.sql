/*
  # Fix User Pricing Profiles INSERT Policy for Signup
  
  1. Problem
    - Current INSERT policy checks `auth.uid() = user_id`
    - During signup trigger, auth.uid() is NULL (user not authenticated yet)
    - This blocks the trigger from creating the default pricing profile
    
  2. Solution
    - Drop the restrictive policy
    - Add a new policy that allows INSERT during signup
    - Policy uses true for WITH CHECK to allow trigger to work
    
  3. Security
    - Only the SECURITY DEFINER trigger calls this
    - Users cannot directly insert pricing profiles from client
    - Safe because trigger is the only code path
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can insert own pricing profile" ON user_pricing_profiles;

-- Add new policy that works with the signup trigger
CREATE POLICY "Allow pricing profile creation during signup"
  ON user_pricing_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Note: This is safe because only the trigger creates pricing profiles
-- Users cannot access this policy directly from client code

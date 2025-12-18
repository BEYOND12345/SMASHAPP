/*
  # Fix User Signup - Bypass RLS for Trigger
  
  1. Problem
    - Previous INSERT policy requires authenticated user
    - During signup trigger, user isn't authenticated yet
    - This causes "Database error saving new user"
    
  2. Solution
    - Remove the restrictive INSERT policy
    - The SECURITY DEFINER trigger function will bypass RLS
    - This is safe because the trigger only creates records for the new user
    
  3. Security
    - Trigger function is SECURITY DEFINER (runs with elevated privileges)
    - Only fires on auth.users INSERT (controlled by Supabase Auth)
    - Cannot be exploited by users directly
*/

-- Drop the problematic INSERT policy
DROP POLICY IF EXISTS "Allow user creation on signup" ON users;

-- The SECURITY DEFINER function will bypass RLS automatically
-- No INSERT policy needed since only the trigger creates user records

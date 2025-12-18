/*
  # Fix User Signup - Add INSERT Policy
  
  1. Problem
    - Signup trigger fails with "Database error saving new user"
    - The public.users table has RLS enabled but no INSERT policy
    - When trigger tries to INSERT into users table, RLS blocks it
    
  2. Solution
    - Add INSERT policy for users table to allow trigger to work
    - Policy allows INSERT only for the user being created (id matches)
    
  3. Security
    - Only allows inserting a user record when id matches auth.uid()
    - Prevents users from creating records for other users
*/

-- Add INSERT policy for users table
CREATE POLICY "Allow user creation on signup"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

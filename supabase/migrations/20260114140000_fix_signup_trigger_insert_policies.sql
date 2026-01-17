/*
  # Fix: "Database error saving new user" on signup

  ## Why this happens
  Our `handle_new_user_signup()` trigger runs on `auth.users` insert and needs to INSERT:
  - `public.organizations`
  - `public.users`
  - `public.user_pricing_profiles`

  In Supabase, RLS policies are still evaluated inside SECURITY DEFINER functions unless RLS is bypassed.
  If INSERT policies for these tables are restricted to `authenticated`, the signup trigger can fail
  (because there is no JWT/session during the auth user creation transaction).

  ## Safe temporary approach
  Allow INSERTs ONLY when the request is NOT coming from PostgREST (no JWT claims present).
  PostgREST sets `request.jwt.claim.*` settings; auth-trigger executions typically do not.

  This restores signup while preventing normal client inserts via anon/authenticated API calls.
*/

-- Organizations: allow insert from auth trigger context (no JWT)
DROP POLICY IF EXISTS "Allow organization creation" ON organizations;
DROP POLICY IF EXISTS "Allow organization creation during signup" ON organizations;
DROP POLICY IF EXISTS "Allow organization creation during auth signup" ON organizations;

CREATE POLICY "Allow organization creation during auth signup"
  ON organizations
  FOR INSERT
  TO public
  WITH CHECK (current_setting('request.jwt.claim.role', true) IS NULL);

-- Users: allow insert from auth trigger context (no JWT)
DROP POLICY IF EXISTS "Allow user creation on signup" ON users;
DROP POLICY IF EXISTS "Allow user creation during signup" ON users;
DROP POLICY IF EXISTS "Allow user creation during auth signup" ON users;

CREATE POLICY "Allow user creation during auth signup"
  ON users
  FOR INSERT
  TO public
  WITH CHECK (current_setting('request.jwt.claim.role', true) IS NULL);

-- Pricing profiles: allow insert from auth trigger context (no JWT)
DROP POLICY IF EXISTS "Allow pricing profile creation during signup" ON user_pricing_profiles;
DROP POLICY IF EXISTS "Allow pricing profile creation during auth signup" ON user_pricing_profiles;

CREATE POLICY "Allow pricing profile creation during auth signup"
  ON user_pricing_profiles
  FOR INSERT
  TO public
  WITH CHECK (current_setting('request.jwt.claim.role', true) IS NULL);


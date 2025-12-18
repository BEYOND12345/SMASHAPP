/*
  # Security Hardening - RLS Fixes

  1. Critical Fixes
    - Remove dangerous PUBLIC INSERT policies that allow direct client access
    - Fix signup trigger to properly bypass RLS using SET LOCAL
    - Split ALL policies into specific SELECT/INSERT/UPDATE/DELETE policies
    - Remove duplicate storage policies
    
  2. Tables Modified
    - organizations: Remove public insert policy, add proper trigger-based insert
    - users: Remove public insert policy
    - user_pricing_profiles: Remove public insert policy  
    - integration_entity_map: Split ALL policy into specific policies
    - qb_oauth_states: Split ALL policy into specific policies
    
  3. Security Impact
    - No more direct client INSERT to sensitive tables
    - Signup still works via SECURITY DEFINER trigger with proper RLS bypass
    - All policies are now explicit and auditable
*/

-- CRITICAL FIX 1: Remove dangerous public INSERT policies
-- These allow ANY client to insert records directly, bypassing the signup trigger

DROP POLICY IF EXISTS "Allow organization creation" ON organizations;
DROP POLICY IF EXISTS "Allow user creation during signup" ON users;
DROP POLICY IF EXISTS "Allow pricing profile creation during signup" ON user_pricing_profiles;

-- CRITICAL FIX 2: Fix the signup trigger function to properly bypass RLS
-- Using SET LOCAL within SECURITY DEFINER function to temporarily disable RLS

CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
BEGIN
  -- Temporarily bypass RLS for this transaction only
  -- This is safe because:
  -- 1. Function is SECURITY DEFINER (runs as owner)
  -- 2. Only triggered by auth.users INSERT (controlled by Supabase Auth)
  -- 3. SET LOCAL only affects current transaction
  SET LOCAL session_replication_role = replica;

  -- Create a new organization for the user
  INSERT INTO organizations (name)
  VALUES (COALESCE(NEW.email, 'New Organization'))
  RETURNING id INTO new_org_id;

  -- Create user record in public.users
  INSERT INTO public.users (id, org_id, email, full_name, role)
  VALUES (
    NEW.id,
    new_org_id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'owner'
  );

  -- Create default pricing profile
  INSERT INTO user_pricing_profiles (
    org_id,
    user_id,
    hourly_rate_cents,
    callout_fee_cents,
    materials_markup_percent,
    default_tax_rate,
    default_currency,
    default_unit_preference,
    bunnings_run_enabled,
    bunnings_run_minutes_default,
    workday_hours_default,
    is_active
  ) VALUES (
    new_org_id,
    NEW.id,
    8500,
    0,
    0,
    10,
    'AUD',
    'metric',
    true,
    60,
    8,
    true
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- FIX 3: Split ALL policies into specific operations for better audit trail

-- integration_entity_map: Replace ALL policy with specific policies
DROP POLICY IF EXISTS "Users can access org integration maps" ON integration_entity_map;

CREATE POLICY "Org members can view integration maps"
  ON integration_entity_map FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can create integration maps"
  ON integration_entity_map FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can update integration maps"
  ON integration_entity_map FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete integration maps"
  ON integration_entity_map FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

-- qb_oauth_states: Replace ALL policy with specific policies
DROP POLICY IF EXISTS "Org members can manage OAuth states" ON qb_oauth_states;

CREATE POLICY "Org members can view OAuth states"
  ON qb_oauth_states FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can create OAuth states"
  ON qb_oauth_states FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can update OAuth states"
  ON qb_oauth_states FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete OAuth states"
  ON qb_oauth_states FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

-- FIX 4: Remove duplicate storage policies
DROP POLICY IF EXISTS "Users can read voice intakes" ON storage.objects;

-- Keep only "Users can read own voice intakes" which is more specific

-- FIX 5: Add restrictive delete policy for organizations (currently missing)
CREATE POLICY "Org owners cannot delete org"
  ON organizations FOR DELETE
  TO authenticated
  USING (false);

-- FIX 6: Add restrictive delete policy for users (currently missing)  
CREATE POLICY "Users cannot delete themselves"
  ON users FOR DELETE
  TO authenticated
  USING (false);

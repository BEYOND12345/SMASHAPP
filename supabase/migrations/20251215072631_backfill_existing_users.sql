/*
  # Backfill Existing Users

  1. Purpose
    - Creates user records for existing auth.users who don't have a public.users record
    - Ensures all users can access quotes and other data through RLS policies
    
  2. Changes
    - Creates organizations for users without them
    - Creates users table records with org_id
    - Creates default pricing profiles
    
  3. Notes
    - Runs once to fix existing users
    - Future users handled by trigger automatically
*/

DO $$
DECLARE
  auth_user RECORD;
  new_org_id uuid;
  existing_user_record RECORD;
BEGIN
  -- Loop through all auth users
  FOR auth_user IN 
    SELECT id, email, raw_user_meta_data
    FROM auth.users
  LOOP
    -- Check if user already has a record
    SELECT * INTO existing_user_record
    FROM public.users
    WHERE id = auth_user.id;
    
    -- Only create if user doesn't exist
    IF existing_user_record IS NULL THEN
      -- Create organization
      INSERT INTO organizations (name)
      VALUES (COALESCE(auth_user.email, 'Organization'))
      RETURNING id INTO new_org_id;
      
      -- Create user record
      INSERT INTO public.users (id, org_id, email, full_name, role)
      VALUES (
        auth_user.id,
        new_org_id,
        auth_user.email,
        COALESCE(auth_user.raw_user_meta_data->>'full_name', auth_user.email),
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
        workday_hours_default
      ) VALUES (
        new_org_id,
        auth_user.id,
        8500,
        0,
        0,
        10,
        'AUD',
        'metric',
        true,
        60,
        8
      );
      
      RAISE NOTICE 'Created records for user: %', auth_user.email;
    END IF;
  END LOOP;
END $$;

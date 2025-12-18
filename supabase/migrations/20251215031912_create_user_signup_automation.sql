/*
  # Automatic User Setup on Signup

  1. Changes
    - Creates organizations table (if not exists) for multi-tenant support
    - Creates trigger function to automatically set up new users on signup
    - Sets up user record with org_id
    - Creates default pricing profile
    
  2. Security
    - Maintains existing RLS policies
    - Ensures every user gets their own org on signup
*/

-- Create organizations table if it doesn't exist
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Organizations policies
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Users can view their own org'
  ) THEN
    CREATE POLICY "Users can view their own org"
      ON organizations FOR SELECT
      TO authenticated
      USING (
        id IN (
          SELECT org_id FROM users WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id uuid;
BEGIN
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
    workday_hours_default
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
    8
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user signups
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

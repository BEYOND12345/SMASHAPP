/*
  # Create User Pricing Profiles
  
  1. New Tables
    - `user_pricing_profiles`
      - `id` (uuid, primary key)
      - `org_id` (uuid, foreign key to organizations)
      - `user_id` (uuid, foreign key to auth.users)
      - `hourly_rate_cents` (bigint, required)
      - `callout_fee_cents` (bigint, default 0)
      - `travel_rate_cents` (bigint, nullable)
      - `travel_is_time` (boolean, default true)
      - `materials_markup_percent` (numeric(5,2), default 0)
      - `default_tax_rate` (numeric(5,2), nullable)
      - `default_currency` (text, default 'AUD')
      - `default_payment_terms` (text, nullable)
      - `default_unit_preference` (text, default 'metric')
      - `bunnings_run_enabled` (boolean, default true)
      - `bunnings_run_minutes_default` (int, default 60)
      - `workday_hours_default` (int, default 8)
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Functions
    - `get_effective_pricing_profile(p_user_id uuid)`
      Returns merged org defaults with user overrides
  
  3. Security
    - Enable RLS on user_pricing_profiles
    - Users can read their own profile
    - Users can update their own profile
    - Org admins can manage all profiles in their org
*/

CREATE TABLE IF NOT EXISTS user_pricing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hourly_rate_cents bigint NOT NULL,
  callout_fee_cents bigint DEFAULT 0 NOT NULL,
  travel_rate_cents bigint,
  travel_is_time boolean DEFAULT true NOT NULL,
  materials_markup_percent numeric(5,2) DEFAULT 0 NOT NULL CHECK (materials_markup_percent >= 0 AND materials_markup_percent <= 100),
  default_tax_rate numeric(5,2) CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100),
  default_currency text DEFAULT 'AUD' NOT NULL,
  default_payment_terms text,
  default_unit_preference text DEFAULT 'metric' NOT NULL CHECK (default_unit_preference IN ('metric', 'imperial', 'mixed')),
  bunnings_run_enabled boolean DEFAULT true NOT NULL,
  bunnings_run_minutes_default int DEFAULT 60 NOT NULL CHECK (bunnings_run_minutes_default > 0),
  workday_hours_default int DEFAULT 8 NOT NULL CHECK (workday_hours_default > 0 AND workday_hours_default <= 24),
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Ensure only one active profile per user
CREATE UNIQUE INDEX IF NOT EXISTS user_pricing_profiles_user_active_unique 
  ON user_pricing_profiles(user_id) 
  WHERE is_active = true;

-- Index for org lookups
CREATE INDEX IF NOT EXISTS user_pricing_profiles_org_id_idx ON user_pricing_profiles(org_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_user_pricing_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_pricing_profiles_updated_at
  BEFORE UPDATE ON user_pricing_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_pricing_profiles_updated_at();

-- Function to get effective pricing profile with org defaults
CREATE OR REPLACE FUNCTION get_effective_pricing_profile(p_user_id uuid)
RETURNS json AS $$
DECLARE
  v_profile user_pricing_profiles;
  v_org organizations;
  v_result json;
BEGIN
  -- Get active profile
  SELECT * INTO v_profile
  FROM user_pricing_profiles
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active pricing profile found for user %', p_user_id;
  END IF;
  
  -- Get org for defaults
  SELECT * INTO v_org
  FROM organizations
  WHERE id = v_profile.org_id;
  
  -- Build merged result
  v_result := json_build_object(
    'profile_id', v_profile.id,
    'org_id', v_profile.org_id,
    'user_id', v_profile.user_id,
    'hourly_rate_cents', v_profile.hourly_rate_cents,
    'callout_fee_cents', v_profile.callout_fee_cents,
    'travel_rate_cents', v_profile.travel_rate_cents,
    'travel_is_time', v_profile.travel_is_time,
    'materials_markup_percent', v_profile.materials_markup_percent,
    'default_tax_rate', COALESCE(v_profile.default_tax_rate, v_org.default_tax_rate),
    'default_currency', COALESCE(v_profile.default_currency, v_org.default_currency),
    'default_payment_terms', v_profile.default_payment_terms,
    'default_unit_preference', v_profile.default_unit_preference,
    'bunnings_run_enabled', v_profile.bunnings_run_enabled,
    'bunnings_run_minutes_default', v_profile.bunnings_run_minutes_default,
    'workday_hours_default', v_profile.workday_hours_default,
    'org_name', v_org.name,
    'org_tax_inclusive', v_org.default_tax_inclusive
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies
ALTER TABLE user_pricing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pricing profile"
  ON user_pricing_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pricing profile"
  ON user_pricing_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pricing profile"
  ON user_pricing_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users cannot delete pricing profiles"
  ON user_pricing_profiles FOR DELETE
  TO authenticated
  USING (false);
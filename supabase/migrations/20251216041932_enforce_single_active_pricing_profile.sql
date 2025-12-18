/*
  # Enforce Single Active Pricing Profile Per User
  
  1. Updates
    - Modify `get_effective_pricing_profile` function to enforce exactly one active profile
    - Add explicit check and error if multiple active profiles exist
    - Add explicit check and error if hourly_rate_cents is null
  
  2. Security
    - Fail-safe approach: if data integrity is violated, the function must fail loudly
    - Never return pricing data if the system is in an inconsistent state
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_effective_pricing_profile(uuid);

-- Recreate with guard rails
CREATE OR REPLACE FUNCTION get_effective_pricing_profile(p_user_id uuid)
RETURNS json AS $$
DECLARE
  v_profile user_pricing_profiles;
  v_org organizations;
  v_result json;
  v_profile_count int;
BEGIN
  -- GUARD RAIL 1: Check for multiple active profiles (data integrity violation)
  SELECT COUNT(*) INTO v_profile_count
  FROM user_pricing_profiles
  WHERE user_id = p_user_id AND is_active = true;
  
  IF v_profile_count > 1 THEN
    RAISE EXCEPTION 'Data integrity violation: User % has % active pricing profiles. Expected exactly 1.', 
      p_user_id, v_profile_count;
  END IF;
  
  IF v_profile_count = 0 THEN
    RAISE EXCEPTION 'No active pricing profile found for user %', p_user_id;
  END IF;
  
  -- Get the single active profile
  SELECT * INTO v_profile
  FROM user_pricing_profiles
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;
  
  -- GUARD RAIL 2: Validate required pricing fields
  IF v_profile.hourly_rate_cents IS NULL OR v_profile.hourly_rate_cents <= 0 THEN
    RAISE EXCEPTION 'Invalid pricing profile: hourly_rate_cents is % for user %', 
      v_profile.hourly_rate_cents, p_user_id;
  END IF;
  
  -- Get org for defaults
  SELECT * INTO v_org
  FROM organizations
  WHERE id = v_profile.org_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization % not found for pricing profile', v_profile.org_id;
  END IF;
  
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
    'default_currency', v_profile.default_currency,
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
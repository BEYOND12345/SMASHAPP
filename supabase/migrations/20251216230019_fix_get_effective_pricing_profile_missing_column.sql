/*
  # Fix get_effective_pricing_profile Missing Column Error

  1. Problem
    - Function references v_org.default_tax_inclusive which doesn't exist
    - Causes function to crash with "record has no field" error
    - Results in "No pricing profile found" error in UI

  2. Solution
    - Remove reference to non-existent column
    - Return org_tax_inclusive as false (default for tax-exclusive pricing)
    - Function will now return successfully

  3. Impact
    - Users can now create quotes after setting pricing in Settings
    - No schema changes required
    - Minimal behavior change (defaults to tax-exclusive)
*/

CREATE OR REPLACE FUNCTION get_effective_pricing_profile(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  -- Get org for name
  SELECT * INTO v_org
  FROM organizations
  WHERE id = v_profile.org_id;

  -- Build merged result (removed reference to non-existent default_tax_inclusive column)
  v_result := json_build_object(
    'profile_id', v_profile.id,
    'org_id', v_profile.org_id,
    'user_id', v_profile.user_id,
    'hourly_rate_cents', v_profile.hourly_rate_cents,
    'callout_fee_cents', v_profile.callout_fee_cents,
    'travel_rate_cents', v_profile.travel_rate_cents,
    'travel_is_time', v_profile.travel_is_time,
    'materials_markup_percent', v_profile.materials_markup_percent,
    'default_tax_rate', v_profile.default_tax_rate,
    'default_currency', v_profile.default_currency,
    'default_payment_terms', v_profile.default_payment_terms,
    'default_unit_preference', v_profile.default_unit_preference,
    'bunnings_run_enabled', v_profile.bunnings_run_enabled,
    'bunnings_run_minutes_default', v_profile.bunnings_run_minutes_default,
    'workday_hours_default', v_profile.workday_hours_default,
    'org_name', COALESCE(v_org.name, 'Organization'),
    'org_tax_inclusive', false
  );

  RETURN v_result;
END;
$$;

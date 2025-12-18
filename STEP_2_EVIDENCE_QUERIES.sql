/*
  STEP 2 PROFILE-AWARE VOICE DRAFTING - EVIDENCE QUERIES

  These queries prove that the voice-to-quote pipeline:
  1. Always uses get_effective_pricing_profile at runtime
  2. Applies hourly_rate_cents correctly to labor line items
  3. Applies materials_markup_percent to materials
  4. Stores pricing snapshot in voice_intakes
  5. Fails if multiple active profiles exist
  6. Fails if hourly_rate_cents is missing
*/

-- ========================================
-- EVIDENCE 1: Voice Draft Uses Profile Pricing
-- ========================================
-- Shows that drafted quotes use hourly_rate_cents from user's active profile
-- and stores the pricing snapshot in voice_intakes

SELECT
  vi.id as intake_id,
  vi.status,
  vi.created_at as intake_created,
  q.id as quote_id,
  q.quote_number,
  q.created_at as quote_created,
  -- Profile pricing used
  (vi.extraction_json->'pricing_used'->>'hourly_rate_cents')::bigint as pricing_snapshot_hourly_rate,
  (vi.extraction_json->'pricing_used'->>'materials_markup_percent')::numeric as pricing_snapshot_markup,
  (vi.extraction_json->'pricing_used'->>'timestamp')::text as pricing_snapshot_time,
  -- Current active profile (should match snapshot at time of draft)
  upp.hourly_rate_cents as current_profile_hourly_rate,
  upp.materials_markup_percent as current_profile_markup,
  -- Labour line item validation
  (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = q.id AND item_type = 'labour') as labour_items,
  (SELECT SUM(line_total_cents) FROM quote_line_items WHERE quote_id = q.id AND item_type = 'labour') as labour_total_cents,
  -- Materials line item validation
  (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = q.id AND item_type = 'materials') as materials_items,
  (SELECT SUM(line_total_cents) FROM quote_line_items WHERE quote_id = q.id AND item_type = 'materials') as materials_total_cents
FROM voice_intakes vi
JOIN quotes q ON vi.created_quote_id = q.id
JOIN user_pricing_profiles upp ON vi.user_id = upp.user_id AND upp.is_active = true
WHERE vi.status IN ('quote_created', 'needs_user_review')
ORDER BY vi.created_at DESC
LIMIT 10;

-- ========================================
-- EVIDENCE 2: Labour Line Total = Hours × Profile Hourly Rate
-- ========================================
-- Proves that each labour line item total equals quantity × unit_price_cents
-- and unit_price_cents comes from the profile snapshot

SELECT
  vi.id as intake_id,
  q.quote_number,
  qli.description as labour_description,
  qli.quantity as hours,
  qli.unit_price_cents as hourly_rate_used,
  qli.line_total_cents as calculated_total,
  -- Verify the math
  ROUND(qli.quantity * qli.unit_price_cents) as expected_total,
  qli.line_total_cents = ROUND(qli.quantity * qli.unit_price_cents) as math_correct,
  -- Compare to profile snapshot
  (vi.extraction_json->'pricing_used'->>'hourly_rate_cents')::bigint as snapshot_hourly_rate,
  qli.unit_price_cents = (vi.extraction_json->'pricing_used'->>'hourly_rate_cents')::bigint as matches_snapshot,
  -- Current profile
  upp.hourly_rate_cents as current_profile_rate,
  qli.created_at
FROM voice_intakes vi
JOIN quotes q ON vi.created_quote_id = q.id
JOIN quote_line_items qli ON q.id = qli.quote_id
JOIN user_pricing_profiles upp ON vi.user_id = upp.user_id AND upp.is_active = true
WHERE qli.item_type = 'labour'
  AND vi.status IN ('quote_created', 'needs_user_review')
ORDER BY vi.created_at DESC
LIMIT 20;

-- ========================================
-- EVIDENCE 3: Materials Markup Applied Correctly
-- ========================================
-- Shows that materials have markup applied and recorded in notes

SELECT
  vi.id as intake_id,
  q.quote_number,
  qli.description as material_description,
  qli.quantity,
  qli.unit_price_cents as marked_up_price,
  qli.line_total_cents,
  qli.notes as markup_details,
  -- Extract base price from notes if available
  (vi.extraction_json->'pricing_used'->>'materials_markup_percent')::numeric as snapshot_markup_percent,
  upp.materials_markup_percent as current_markup_percent,
  qli.created_at
FROM voice_intakes vi
JOIN quotes q ON vi.created_quote_id = q.id
JOIN quote_line_items qli ON q.id = qli.quote_id
JOIN user_pricing_profiles upp ON vi.user_id = upp.user_id AND upp.is_active = true
WHERE qli.item_type = 'materials'
  AND vi.status IN ('quote_created', 'needs_user_review')
ORDER BY vi.created_at DESC
LIMIT 20;

-- ========================================
-- EVIDENCE 4: Pricing Snapshot is Always Stored
-- ========================================
-- Verifies that every quote created from voice has a pricing_used snapshot

SELECT
  vi.id as intake_id,
  vi.user_id,
  vi.status,
  vi.created_quote_id,
  -- Check if pricing_used exists
  (vi.extraction_json ? 'pricing_used') as has_pricing_snapshot,
  -- Extract snapshot details
  jsonb_pretty(vi.extraction_json->'pricing_used') as pricing_snapshot,
  vi.created_at,
  vi.updated_at
FROM voice_intakes vi
WHERE vi.created_quote_id IS NOT NULL
ORDER BY vi.created_at DESC
LIMIT 10;

-- ========================================
-- EVIDENCE 5: Profile Change Affects Next Quote
-- ========================================
-- Test: Update a user's hourly rate and verify the next quote uses new rate
-- This query shows the timeline of profile changes and quote creation

SELECT
  upp.user_id,
  'Profile Update' as event_type,
  upp.updated_at as event_time,
  upp.hourly_rate_cents as rate_value,
  NULL as quote_number,
  NULL as labour_rate_used
FROM user_pricing_profiles upp
WHERE upp.is_active = true

UNION ALL

SELECT
  vi.user_id,
  'Quote Created' as event_type,
  q.created_at as event_time,
  (vi.extraction_json->'pricing_used'->>'hourly_rate_cents')::bigint as rate_value,
  q.quote_number,
  (SELECT qli.unit_price_cents
   FROM quote_line_items qli
   WHERE qli.quote_id = q.id
     AND qli.item_type = 'labour'
   LIMIT 1) as labour_rate_used
FROM voice_intakes vi
JOIN quotes q ON vi.created_quote_id = q.id
WHERE vi.created_quote_id IS NOT NULL

ORDER BY user_id, event_time DESC
LIMIT 50;

-- ========================================
-- EVIDENCE 6: Multiple Active Profiles Would Fail
-- ========================================
-- This query identifies any data integrity violations
-- If this returns rows, get_effective_pricing_profile WILL fail

SELECT
  user_id,
  COUNT(*) as active_profile_count,
  array_agg(id) as profile_ids,
  array_agg(hourly_rate_cents) as hourly_rates
FROM user_pricing_profiles
WHERE is_active = true
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Expected result: 0 rows (enforced by unique index)

-- ========================================
-- EVIDENCE 7: Missing Hourly Rate Would Fail
-- ========================================
-- This query identifies profiles with invalid hourly rates
-- If this returns rows, get_effective_pricing_profile WILL fail

SELECT
  id as profile_id,
  user_id,
  hourly_rate_cents,
  is_active,
  created_at
FROM user_pricing_profiles
WHERE is_active = true
  AND (hourly_rate_cents IS NULL OR hourly_rate_cents <= 0);

-- Expected result: 0 rows (enforced by validation)

-- ========================================
-- EVIDENCE 8: End-to-End Audit Trail
-- ========================================
-- Complete audit trail for a single voice intake showing:
-- - User's active profile at time of draft
-- - Pricing snapshot stored
-- - Quote created with correct pricing
-- - All line items use correct rates

-- Replace {INTAKE_ID} with actual intake ID to test
WITH intake_data AS (
  SELECT * FROM voice_intakes WHERE id = '{INTAKE_ID}'
)
SELECT
  'INTAKE' as section,
  jsonb_build_object(
    'intake_id', id,
    'user_id', user_id,
    'status', status,
    'created_at', created_at,
    'pricing_snapshot', extraction_json->'pricing_used'
  ) as data
FROM intake_data

UNION ALL

SELECT
  'PROFILE' as section,
  jsonb_build_object(
    'profile_id', upp.id,
    'hourly_rate_cents', upp.hourly_rate_cents,
    'materials_markup_percent', upp.materials_markup_percent,
    'callout_fee_cents', upp.callout_fee_cents,
    'travel_rate_cents', upp.travel_rate_cents,
    'travel_is_time', upp.travel_is_time,
    'bunnings_run_enabled', upp.bunnings_run_enabled,
    'bunnings_run_minutes_default', upp.bunnings_run_minutes_default,
    'workday_hours_default', upp.workday_hours_default
  )
FROM intake_data id
JOIN user_pricing_profiles upp ON id.user_id = upp.user_id AND upp.is_active = true

UNION ALL

SELECT
  'QUOTE' as section,
  jsonb_build_object(
    'quote_id', q.id,
    'quote_number', q.quote_number,
    'currency', q.currency,
    'default_tax_rate', q.default_tax_rate,
    'tax_inclusive', q.tax_inclusive,
    'created_at', q.created_at
  )
FROM intake_data id
JOIN quotes q ON id.created_quote_id = q.id

UNION ALL

SELECT
  'LINE_ITEMS' as section,
  jsonb_agg(
    jsonb_build_object(
      'item_type', qli.item_type,
      'description', qli.description,
      'quantity', qli.quantity,
      'unit', qli.unit,
      'unit_price_cents', qli.unit_price_cents,
      'line_total_cents', qli.line_total_cents,
      'notes', qli.notes
    ) ORDER BY qli.position
  )
FROM intake_data id
JOIN quotes q ON id.created_quote_id = q.id
JOIN quote_line_items qli ON q.id = qli.quote_id;

-- ========================================
-- EVIDENCE 9: Materials Markup Calculation Proof
-- ========================================
-- For materials items with notes containing "Base:" text,
-- extract the base price and verify markup calculation

SELECT
  q.quote_number,
  qli.description as material,
  qli.notes,
  -- Try to extract base price from notes (format: "Base: $XX.XX")
  CASE
    WHEN qli.notes LIKE '%Base: $%' THEN
      CAST(
        substring(qli.notes from 'Base: \$([0-9.]+)') AS numeric
      ) * 100  -- Convert to cents
    ELSE NULL
  END as extracted_base_cents,
  -- Extract markup percent from notes
  CASE
    WHEN qli.notes LIKE '%Markup: %' THEN
      CAST(
        substring(qli.notes from 'Markup: ([0-9.]+)%') AS numeric
      )
    ELSE NULL
  END as extracted_markup_percent,
  qli.unit_price_cents as marked_up_price,
  -- Calculate expected marked up price
  CASE
    WHEN qli.notes LIKE '%Base: $%' AND qli.notes LIKE '%Markup: %' THEN
      ROUND(
        CAST(substring(qli.notes from 'Base: \$([0-9.]+)') AS numeric) * 100 *
        (1 + CAST(substring(qli.notes from 'Markup: ([0-9.]+)%') AS numeric) / 100)
      )
    ELSE NULL
  END as expected_marked_up_price,
  -- Verify calculation
  qli.unit_price_cents = ROUND(
    CAST(substring(qli.notes from 'Base: \$([0-9.]+)') AS numeric) * 100 *
    (1 + CAST(substring(qli.notes from 'Markup: ([0-9.]+)%') AS numeric) / 100)
  ) as markup_calculation_correct
FROM quote_line_items qli
JOIN quotes q ON qli.quote_id = q.id
JOIN voice_intakes vi ON q.id = vi.created_quote_id
WHERE qli.item_type = 'materials'
  AND qli.notes LIKE '%Base:%'
  AND qli.notes LIKE '%Markup:%'
ORDER BY qli.created_at DESC
LIMIT 20;

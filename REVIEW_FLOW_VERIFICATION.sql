-- REVIEW FLOW VERIFICATION QUERIES
-- Run these to verify the fix is working correctly

-- ============================================================================
-- 1. CHECK CURRENT REVIEW STATE
-- Shows all intakes currently in review with their confidence levels
-- ============================================================================
SELECT
  vi.id,
  vi.status,
  vi.created_at,
  (vi.extraction_json->'quality'->>'overall_confidence')::numeric as confidence,
  (vi.extraction_json->'quality'->>'requires_user_confirmation')::boolean as requires_confirmation,
  (vi.extraction_json->'quality'->>'user_confirmed')::boolean as user_confirmed,
  vi.extraction_json->'quality'->>'user_confirmed_at' as confirmed_at,
  array_length(COALESCE(vi.assumptions, ARRAY[]::jsonb[]), 1) as assumptions_count,
  array_length(COALESCE(vi.missing_fields, ARRAY[]::jsonb[]), 1) as missing_fields_count,
  vi.created_quote_id
FROM voice_intakes vi
WHERE vi.status = 'needs_user_review'
ORDER BY vi.created_at DESC
LIMIT 10;

-- Expected Result:
-- - requires_confirmation should be TRUE for all in review
-- - user_confirmed should be NULL (not yet confirmed)
-- - created_quote_id should be NULL


-- ============================================================================
-- 2. CHECK SUCCESSFULLY CONFIRMED REVIEWS
-- Shows intakes that were reviewed and confirmed by user
-- ============================================================================
SELECT
  vi.id,
  vi.status,
  (vi.extraction_json->'quality'->>'overall_confidence')::numeric as confidence,
  (vi.extraction_json->'quality'->>'user_confirmed')::boolean as user_confirmed,
  vi.extraction_json->'quality'->>'user_confirmed_at' as confirmed_at,
  vi.created_quote_id,
  q.quote_number,
  q.status as quote_status,
  vi.created_at as intake_created,
  q.created_at as quote_created
FROM voice_intakes vi
LEFT JOIN quotes q ON q.id = vi.created_quote_id
WHERE (vi.extraction_json->'quality'->>'user_confirmed')::boolean = true
ORDER BY vi.created_at DESC
LIMIT 10;

-- Expected Result:
-- - user_confirmed should be TRUE
-- - status should be 'quote_created'
-- - created_quote_id should be populated
-- - quote should exist with matching ID


-- ============================================================================
-- 3. CHECK FOR STUCK REVIEWS (Potential Infinite Loops)
-- Identifies intakes stuck in review for >1 hour
-- ============================================================================
SELECT
  vi.id,
  vi.status,
  vi.created_at,
  NOW() - vi.created_at as time_in_review,
  (vi.extraction_json->'quality'->>'overall_confidence')::numeric as confidence,
  array_length(COALESCE(vi.assumptions, ARRAY[]::jsonb[]), 1) as assumptions_count,
  array_length(COALESCE(vi.missing_fields, ARRAY[]::jsonb[]), 1) as missing_fields_count,
  vi.user_corrections_json IS NOT NULL as has_corrections,
  (vi.extraction_json->'quality'->>'user_confirmed')::boolean as user_confirmed
FROM voice_intakes vi
WHERE vi.status = 'needs_user_review'
  AND vi.created_at < NOW() - INTERVAL '1 hour'
ORDER BY vi.created_at ASC;

-- Expected Result (After Fix):
-- - Should be EMPTY or very few entries
-- - If entries exist, check has_corrections and user_confirmed
-- - If both are TRUE but still in review, the fix may not be working


-- ============================================================================
-- 4. REVIEW FLOW SUCCESS RATE
-- Calculate how many reviews complete successfully vs get stuck
-- ============================================================================
WITH review_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'needs_user_review') as currently_in_review,
    COUNT(*) FILTER (WHERE status = 'quote_created'
                     AND (extraction_json->'quality'->>'user_confirmed')::boolean = true) as completed_reviews,
    COUNT(*) FILTER (WHERE status = 'needs_user_review'
                     AND created_at < NOW() - INTERVAL '1 hour') as stuck_reviews
  FROM voice_intakes
  WHERE created_at > NOW() - INTERVAL '24 hours'
)
SELECT
  currently_in_review,
  completed_reviews,
  stuck_reviews,
  CASE
    WHEN (completed_reviews + currently_in_review) > 0
    THEN ROUND(100.0 * completed_reviews / (completed_reviews + currently_in_review), 1)
    ELSE 0
  END as completion_rate_percent,
  CASE
    WHEN stuck_reviews > 0 THEN 'WARNING: Reviews getting stuck'
    WHEN completion_rate_percent > 80 THEN 'HEALTHY'
    WHEN completion_rate_percent > 50 THEN 'MODERATE'
    ELSE 'POOR'
  END as health_status
FROM review_stats;

-- Expected Result (After Fix):
-- - completion_rate_percent should be >80%
-- - stuck_reviews should be 0 or very low
-- - health_status should be 'HEALTHY'


-- ============================================================================
-- 5. LOW CONFIDENCE WITH ZERO ISSUES (The Fixed Bug Case)
-- Find intakes that have low confidence but no missing fields/assumptions
-- These should complete after user confirmation
-- ============================================================================
SELECT
  vi.id,
  vi.status,
  (vi.extraction_json->'quality'->>'overall_confidence')::numeric as confidence,
  array_length(COALESCE(vi.assumptions, ARRAY[]::jsonb[]), 1) as assumptions_count,
  array_length(COALESCE(vi.missing_fields, ARRAY[]::jsonb[]), 1) as missing_fields_count,
  (vi.extraction_json->'quality'->>'user_confirmed')::boolean as user_confirmed,
  vi.created_quote_id IS NOT NULL as has_quote,
  vi.created_at
FROM voice_intakes vi
WHERE (vi.extraction_json->'quality'->>'overall_confidence')::numeric < 0.7
  AND array_length(COALESCE(vi.assumptions, ARRAY[]::jsonb[]), 1) = 0
  AND array_length(COALESCE(vi.missing_fields, ARRAY[]::jsonb[]), 1) = 0
ORDER BY vi.created_at DESC
LIMIT 10;

-- Expected Result (After Fix):
-- - If user_confirmed = TRUE, should have has_quote = TRUE
-- - If user_confirmed = FALSE/NULL, status should be 'needs_user_review'
-- - No stuck cases with user_confirmed = TRUE but no quote


-- ============================================================================
-- 6. CONFIDENCE DISTRIBUTION IN REVIEW
-- See what confidence levels trigger review
-- ============================================================================
SELECT
  CASE
    WHEN (extraction_json->'quality'->>'overall_confidence')::numeric >= 0.85 THEN 'High (85%+)'
    WHEN (extraction_json->'quality'->>'overall_confidence')::numeric >= 0.70 THEN 'Medium (70-85%)'
    WHEN (extraction_json->'quality'->>'overall_confidence')::numeric >= 0.50 THEN 'Low (50-70%)'
    ELSE 'Very Low (<50%)'
  END as confidence_bucket,
  COUNT(*) as intake_count,
  COUNT(*) FILTER (WHERE status = 'needs_user_review') as in_review,
  COUNT(*) FILTER (WHERE status = 'quote_created') as completed,
  COUNT(*) FILTER (WHERE (extraction_json->'quality'->>'user_confirmed')::boolean = true) as user_confirmed_count
FROM voice_intakes
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY confidence_bucket
ORDER BY
  CASE confidence_bucket
    WHEN 'Very Low (<50%)' THEN 1
    WHEN 'Low (50-70%)' THEN 2
    WHEN 'Medium (70-85%)' THEN 3
    WHEN 'High (85%+)' THEN 4
  END;

-- Expected Result:
-- - Most 'High' confidence should skip review (in_review = 0)
-- - 'Low' confidence should have high user_confirmed_count
-- - Very few should be stuck in 'in_review' status


-- ============================================================================
-- 7. REVIEW TO QUOTE TIME
-- Measure how long it takes from entering review to quote creation
-- ============================================================================
SELECT
  vi.id,
  (vi.extraction_json->'quality'->>'overall_confidence')::numeric as confidence,
  vi.created_at as entered_review,
  (vi.extraction_json->'quality'->>'user_confirmed_at')::timestamptz as confirmed_at,
  q.created_at as quote_created,
  EXTRACT(EPOCH FROM ((vi.extraction_json->'quality'->>'user_confirmed_at')::timestamptz - vi.created_at)) / 60 as minutes_to_confirm,
  EXTRACT(EPOCH FROM (q.created_at - (vi.extraction_json->'quality'->>'user_confirmed_at')::timestamptz)) as seconds_to_quote
FROM voice_intakes vi
JOIN quotes q ON q.id = vi.created_quote_id
WHERE (vi.extraction_json->'quality'->>'user_confirmed')::boolean = true
  AND vi.created_at > NOW() - INTERVAL '7 days'
ORDER BY vi.created_at DESC
LIMIT 20;

-- Expected Result:
-- - minutes_to_confirm shows user review time (manual process)
-- - seconds_to_quote should be <5 seconds (automated process)
-- - If seconds_to_quote is very high, there may be system delays


-- ============================================================================
-- SUMMARY QUERY - ONE VIEW TO RULE THEM ALL
-- ============================================================================
WITH summary AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'needs_user_review') as needs_review,
    COUNT(*) FILTER (WHERE status = 'quote_created'
                     AND (extraction_json->'quality'->>'user_confirmed')::boolean = true) as confirmed_and_completed,
    COUNT(*) FILTER (WHERE status = 'needs_user_review'
                     AND created_at < NOW() - INTERVAL '1 hour') as stuck_over_1h,
    COUNT(*) FILTER (WHERE (extraction_json->'quality'->>'requires_user_confirmation')::boolean = true
                     AND status = 'quote_created') as review_bypassed_incorrectly,
    AVG((extraction_json->'quality'->>'overall_confidence')::numeric)
      FILTER (WHERE status = 'needs_user_review') as avg_confidence_in_review
  FROM voice_intakes
  WHERE created_at > NOW() - INTERVAL '24 hours'
)
SELECT
  needs_review as "Currently in Review",
  confirmed_and_completed as "Successfully Confirmed",
  stuck_over_1h as "Stuck >1 Hour (BAD)",
  review_bypassed_incorrectly as "Bypassed Review (BAD)",
  ROUND(avg_confidence_in_review::numeric, 2) as "Avg Confidence in Review",
  CASE
    WHEN stuck_over_1h = 0 AND review_bypassed_incorrectly = 0 THEN '✅ HEALTHY'
    WHEN stuck_over_1h < 3 THEN '⚠️ NEEDS ATTENTION'
    ELSE '❌ CRITICAL ISSUES'
  END as "System Health"
FROM summary;

-- Expected Result (Healthy System):
-- - Stuck >1 Hour: 0
-- - Bypassed Review: 0
-- - System Health: ✅ HEALTHY

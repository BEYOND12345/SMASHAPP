-- ============================================================================
-- REVIEW FLOW VERIFICATION QUERIES
-- Use these to verify the proper fix is working correctly
-- ============================================================================

-- ============================================================================
-- QUERY 1: Check Specific Intake State
-- Replace [INTAKE_ID] with actual intake ID
-- ============================================================================
SELECT
  id,
  status,
  created_quote_id,
  created_at,
  extraction_json->'quality'->>'overall_confidence' as confidence,
  extraction_json->'quality'->>'requires_user_confirmation' as requires_confirmation,
  extraction_json->'quality'->>'user_confirmed' as user_confirmed,
  extraction_json->'quality'->>'user_confirmed_at' as confirmed_at,
  user_corrections_json IS NOT NULL as has_corrections
FROM voice_intakes
WHERE id = '[INTAKE_ID]';

-- Expected BEFORE confirmation:
-- status: 'needs_user_review'
-- requires_confirmation: 'true'
-- user_confirmed: null
-- created_quote_id: null

-- Expected AFTER confirmation:
-- status: 'quote_created'
-- requires_confirmation: 'false'
-- user_confirmed: 'true'
-- confirmed_at: timestamp
-- created_quote_id: uuid


-- ============================================================================
-- QUERY 2: Verify Quote Was Created for Intake
-- Replace [INTAKE_ID] with actual intake ID
-- ============================================================================
SELECT
  q.id as quote_id,
  q.quote_number,
  q.status as quote_status,
  q.created_at as quote_created_at,
  vi.id as intake_id,
  vi.status as intake_status,
  COUNT(qli.id) as line_items_count
FROM voice_intakes vi
JOIN quotes q ON q.id = vi.created_quote_id
LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
WHERE vi.id = '[INTAKE_ID]'
GROUP BY q.id, q.quote_number, q.status, q.created_at, vi.id, vi.status;

-- Expected:
-- quote_id: populated
-- quote_number: generated
-- quote_status: 'draft'
-- line_items_count: > 0
-- intake_status: 'quote_created'


-- ============================================================================
-- QUERY 3: Check for Forbidden State (MUST RETURN 0)
-- Intakes with both review status AND a created quote is impossible
-- ============================================================================
SELECT
  id,
  status,
  created_quote_id,
  created_at,
  extraction_json->'quality'->>'user_confirmed' as user_confirmed
FROM voice_intakes
WHERE status = 'needs_user_review'
  AND created_quote_id IS NOT NULL;

-- Expected: NO ROWS (empty result)
-- If any rows: CRITICAL BUG - quote was created but status not updated


-- ============================================================================
-- QUERY 4: Intakes Stuck in Review (>1 hour)
-- These may indicate users who abandoned the flow, or system issues
-- ============================================================================
SELECT
  id,
  status,
  created_at,
  NOW() - created_at as time_in_review,
  extraction_json->'quality'->>'overall_confidence' as confidence,
  array_length(COALESCE(assumptions, ARRAY[]::jsonb[]), 1) as assumptions_count,
  array_length(COALESCE(missing_fields, ARRAY[]::jsonb[]), 1) as missing_fields_count,
  user_corrections_json IS NOT NULL as has_corrections
FROM voice_intakes
WHERE status = 'needs_user_review'
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at ASC;

-- Expected: Empty or very few rows
-- If many rows: Users are abandoning review, investigate UX


-- ============================================================================
-- QUERY 5: Review Flow Success Rate (Last 24 Hours)
-- ============================================================================
WITH review_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'needs_user_review') as currently_in_review,
    COUNT(*) FILTER (WHERE status = 'quote_created'
                     AND (extraction_json->'quality'->>'user_confirmed')::boolean = true) as completed_reviews,
    COUNT(*) FILTER (WHERE status = 'needs_user_review'
                     AND created_at < NOW() - INTERVAL '1 hour') as stuck_reviews,
    COUNT(*) FILTER (WHERE status = 'needs_user_review'
                     AND created_quote_id IS NOT NULL) as impossible_state
  FROM voice_intakes
  WHERE created_at > NOW() - INTERVAL '24 hours'
)
SELECT
  currently_in_review,
  completed_reviews,
  stuck_reviews,
  impossible_state,
  CASE
    WHEN (completed_reviews + currently_in_review) > 0
    THEN ROUND(100.0 * completed_reviews / (completed_reviews + currently_in_review), 1)
    ELSE 0
  END as completion_rate_percent,
  CASE
    WHEN impossible_state > 0 THEN '❌ CRITICAL: Impossible state detected'
    WHEN stuck_reviews > 5 THEN '⚠️ WARNING: Many stuck reviews'
    WHEN completion_rate_percent > 80 THEN '✅ HEALTHY'
    WHEN completion_rate_percent > 50 THEN '⚠️ MODERATE'
    ELSE '❌ POOR'
  END as health_status
FROM review_stats;

-- Expected:
-- completion_rate_percent: > 80%
-- stuck_reviews: < 5
-- impossible_state: 0
-- health_status: '✅ HEALTHY'


-- ============================================================================
-- QUERY 6: Recent Intakes with User Confirmation
-- Shows successful review flow completions
-- ============================================================================
SELECT
  vi.id,
  vi.status,
  vi.created_at as intake_created,
  (vi.extraction_json->'quality'->>'overall_confidence')::numeric as confidence,
  (vi.extraction_json->'quality'->>'user_confirmed')::boolean as user_confirmed,
  vi.extraction_json->'quality'->>'user_confirmed_at' as confirmed_at,
  q.quote_number,
  q.created_at as quote_created,
  EXTRACT(EPOCH FROM (q.created_at - (vi.extraction_json->'quality'->>'user_confirmed_at')::timestamptz)) as seconds_to_quote_after_confirm
FROM voice_intakes vi
LEFT JOIN quotes q ON q.id = vi.created_quote_id
WHERE (vi.extraction_json->'quality'->>'user_confirmed')::boolean = true
ORDER BY vi.created_at DESC
LIMIT 10;

-- What to look for:
-- user_confirmed: true
-- confirmed_at: timestamp present
-- quote_number: populated
-- seconds_to_quote_after_confirm: < 5 seconds (should be fast)


-- ============================================================================
-- QUERY 7: Confidence Distribution in Reviews
-- Understand what confidence levels trigger review
-- ============================================================================
SELECT
  CASE
    WHEN (extraction_json->'quality'->>'overall_confidence')::numeric >= 0.85 THEN 'High (≥85%)'
    WHEN (extraction_json->'quality'->>'overall_confidence')::numeric >= 0.70 THEN 'Medium (70-85%)'
    WHEN (extraction_json->'quality'->>'overall_confidence')::numeric >= 0.50 THEN 'Low (50-70%)'
    ELSE 'Very Low (<50%)'
  END as confidence_bucket,
  COUNT(*) as total_intakes,
  COUNT(*) FILTER (WHERE status = 'needs_user_review') as in_review,
  COUNT(*) FILTER (WHERE status = 'quote_created') as completed,
  COUNT(*) FILTER (WHERE (extraction_json->'quality'->>'user_confirmed')::boolean = true) as user_confirmed_count,
  ROUND(AVG(CASE WHEN status = 'quote_created' THEN 1.0 ELSE 0.0 END) * 100, 1) as completion_rate_percent
FROM voice_intakes
WHERE created_at > NOW() - INTERVAL '7 days'
  AND extraction_json->'quality'->>'overall_confidence' IS NOT NULL
GROUP BY confidence_bucket
ORDER BY
  CASE confidence_bucket
    WHEN 'Very Low (<50%)' THEN 1
    WHEN 'Low (50-70%)' THEN 2
    WHEN 'Medium (70-85%)' THEN 3
    WHEN 'High (≥85%)' THEN 4
  END;

-- Expected:
-- High confidence: mostly skip review (in_review ≈ 0)
-- Low confidence: high user_confirmed_count
-- Completion rate should be >80% across all buckets


-- ============================================================================
-- QUERY 8: Time to Complete Review Flow
-- Measures user review time + system processing time
-- ============================================================================
SELECT
  vi.id,
  (vi.extraction_json->'quality'->>'overall_confidence')::numeric as confidence,
  vi.created_at as intake_created,
  (vi.extraction_json->'quality'->>'user_confirmed_at')::timestamptz as user_confirmed_at,
  q.created_at as quote_created,
  EXTRACT(EPOCH FROM ((vi.extraction_json->'quality'->>'user_confirmed_at')::timestamptz - vi.created_at)) / 60 as minutes_user_review,
  EXTRACT(EPOCH FROM (q.created_at - (vi.extraction_json->'quality'->>'user_confirmed_at')::timestamptz)) as seconds_system_processing
FROM voice_intakes vi
JOIN quotes q ON q.id = vi.created_quote_id
WHERE (vi.extraction_json->'quality'->>'user_confirmed')::boolean = true
  AND vi.created_at > NOW() - INTERVAL '7 days'
ORDER BY vi.created_at DESC
LIMIT 20;

-- What to look for:
-- minutes_user_review: Variable (human speed)
-- seconds_system_processing: < 5 seconds (should be fast)
-- If seconds_system_processing > 10: System performance issue


-- ============================================================================
-- QUERY 9: Audit Trail for Specific Intake
-- Shows complete history with all state changes
-- ============================================================================
SELECT
  id,
  status,
  created_at,
  extraction_json->'quality' as quality_metadata,
  assumptions,
  missing_fields,
  user_corrections_json,
  created_quote_id
FROM voice_intakes
WHERE id = '[INTAKE_ID]';

-- Examine:
-- quality_metadata: Should show user_confirmed, confirmed_at, requires_user_confirmation
-- assumptions: What assumptions were made
-- missing_fields: What fields were flagged
-- user_corrections_json: What user changed


-- ============================================================================
-- QUERY 10: Daily Summary (Run Every Day)
-- ============================================================================
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_intakes,
  COUNT(*) FILTER (WHERE status = 'needs_user_review') as needs_review,
  COUNT(*) FILTER (WHERE status = 'quote_created') as quotes_created,
  COUNT(*) FILTER (WHERE (extraction_json->'quality'->>'user_confirmed')::boolean = true) as user_reviews_completed,
  COUNT(*) FILTER (WHERE status = 'needs_user_review' AND created_quote_id IS NOT NULL) as impossible_state_count,
  ROUND(AVG((extraction_json->'quality'->>'overall_confidence')::numeric), 2) as avg_confidence,
  ROUND(COUNT(*) FILTER (WHERE status = 'quote_created') * 100.0 / COUNT(*), 1) as success_rate_percent
FROM voice_intakes
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Health indicators:
-- impossible_state_count: MUST be 0
-- success_rate_percent: Should be >80%
-- user_reviews_completed: Should match intakes that needed review


-- ============================================================================
-- QUICK HEALTH CHECK (Run This First)
-- ============================================================================
SELECT
  'Total Intakes (24h)' as metric,
  COUNT(*)::text as value
FROM voice_intakes
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT
  'Currently in Review' as metric,
  COUNT(*)::text as value
FROM voice_intakes
WHERE status = 'needs_user_review'
  AND created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT
  'Quotes Created (24h)' as metric,
  COUNT(*)::text as value
FROM voice_intakes
WHERE status = 'quote_created'
  AND created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT
  'Stuck in Review >1h' as metric,
  COUNT(*)::text as value
FROM voice_intakes
WHERE status = 'needs_user_review'
  AND created_at < NOW() - INTERVAL '1 hour'

UNION ALL

SELECT
  '🚨 IMPOSSIBLE STATE' as metric,
  COUNT(*)::text as value
FROM voice_intakes
WHERE status = 'needs_user_review'
  AND created_quote_id IS NOT NULL

UNION ALL

SELECT
  'User Reviews Completed' as metric,
  COUNT(*)::text as value
FROM voice_intakes
WHERE (extraction_json->'quality'->>'user_confirmed')::boolean = true
  AND created_at > NOW() - INTERVAL '24 hours';


-- ============================================================================
-- USAGE INSTRUCTIONS
-- ============================================================================

-- 1. For debugging a specific intake:
--    Use QUERY 1, 2, and 9
--    Replace [INTAKE_ID] with actual ID

-- 2. For daily health monitoring:
--    Run QUICK HEALTH CHECK and QUERY 5

-- 3. For identifying stuck flows:
--    Run QUERY 3 (should be 0) and QUERY 4

-- 4. For performance analysis:
--    Run QUERY 6 and QUERY 8

-- 5. For trend analysis:
--    Run QUERY 7 and QUERY 10

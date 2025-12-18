-- Confidence Fix Verification Queries
-- Run these after deploying the confidence validation fix and migration

-- =============================================================================
-- QUERY 1: Count of needs_user_review with NULL confidence (MUST BE 0)
-- =============================================================================
-- Expected: 0 records
-- If > 0: Critical issue - fix not working

SELECT COUNT(*) as null_confidence_count
FROM voice_intakes
WHERE status = 'needs_user_review'
  AND extraction_json IS NOT NULL
  AND (extraction_json->'quality'->>'overall_confidence') IS NULL;

-- =============================================================================
-- QUERY 2: Sample rows with NULL confidence (should be empty)
-- =============================================================================
-- Expected: No rows returned
-- If rows returned: Shows which intakes still have NULL confidence

SELECT
  id,
  status,
  created_at,
  extraction_json->'quality' as quality_object,
  extraction_json->'quality'->>'overall_confidence' as confidence
FROM voice_intakes
WHERE extraction_json IS NOT NULL
  AND (extraction_json->'quality'->>'overall_confidence') IS NULL
ORDER BY created_at DESC
LIMIT 10;

-- =============================================================================
-- QUERY 3: Count of needs_user_review stuck older than 30 minutes
-- =============================================================================
-- Expected: Decreasing over time as users progress
-- High count indicates other blocking issues

SELECT
  COUNT(*) as stuck_review_count,
  MIN(created_at) as oldest_stuck,
  MAX(created_at) as newest_stuck,
  ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60)) as avg_stuck_minutes
FROM voice_intakes
WHERE status = 'needs_user_review'
  AND created_at < NOW() - INTERVAL '30 minutes';

-- =============================================================================
-- QUERY 4: Status distribution (overall health check)
-- =============================================================================
-- Shows breakdown of all voice intakes by status

SELECT
  status,
  COUNT(*) as count,
  COUNT(CASE WHEN created_quote_id IS NOT NULL THEN 1 END) as has_quote,
  COUNT(CASE WHEN extraction_json IS NOT NULL THEN 1 END) as has_extraction,
  COUNT(CASE WHEN (extraction_json->'quality'->>'user_confirmed')::boolean = true THEN 1 END) as user_confirmed_count,
  COUNT(CASE WHEN (extraction_json->'quality'->>'overall_confidence') IS NULL THEN 1 END) as null_confidence_count
FROM voice_intakes
GROUP BY status
ORDER BY count DESC;

-- =============================================================================
-- QUERY 5: Confidence value distribution
-- =============================================================================
-- Shows what confidence values exist in the system
-- Should see 0.5 for backfilled records, various values for valid extractions

SELECT
  status,
  (extraction_json->'quality'->>'overall_confidence')::numeric as confidence,
  COUNT(*) as count
FROM voice_intakes
WHERE extraction_json IS NOT NULL
  AND extraction_json->'quality' IS NOT NULL
  AND (extraction_json->'quality'->>'overall_confidence') IS NOT NULL
GROUP BY status, (extraction_json->'quality'->>'overall_confidence')::numeric
ORDER BY status, confidence DESC;

-- =============================================================================
-- QUERY 6: Recent extractions check (last 24 hours)
-- =============================================================================
-- Verify new extractions are not creating NULL confidence
-- All should have valid numeric confidence

SELECT
  id,
  status,
  created_at,
  (extraction_json->'quality'->>'overall_confidence')::numeric as confidence,
  CASE
    WHEN (extraction_json->'quality'->>'overall_confidence') IS NULL THEN 'NULL - BUG!'
    WHEN (extraction_json->'quality'->>'overall_confidence')::numeric = 0.5 THEN 'Default applied'
    ELSE 'Valid AI score'
  END as confidence_source
FROM voice_intakes
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND extraction_json IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;

-- =============================================================================
-- QUERY 7: Impossible states detector (should always be 0)
-- =============================================================================
-- Detects records in invalid states

SELECT
  'needs_user_review + has_quote' as impossible_state,
  COUNT(*) as count
FROM voice_intakes
WHERE status = 'needs_user_review'
  AND created_quote_id IS NOT NULL

UNION ALL

SELECT
  'quote_created + no_quote' as impossible_state,
  COUNT(*) as count
FROM voice_intakes
WHERE status = 'quote_created'
  AND created_quote_id IS NULL

UNION ALL

SELECT
  'extracted + has_quality + NULL_confidence' as impossible_state,
  COUNT(*) as count
FROM voice_intakes
WHERE status IN ('extracted', 'needs_user_review', 'quote_created')
  AND extraction_json IS NOT NULL
  AND extraction_json->'quality' IS NOT NULL
  AND (extraction_json->'quality'->>'overall_confidence') IS NULL;

-- =============================================================================
-- SUMMARY QUERY: One-line health check
-- =============================================================================
-- Quick yes/no answer: Is the system healthy?
-- Expected: null_confidence = 0, impossible_states = 0, stuck_reviews < 5

SELECT
  (SELECT COUNT(*) FROM voice_intakes
   WHERE extraction_json IS NOT NULL
   AND (extraction_json->'quality'->>'overall_confidence') IS NULL) as null_confidence_count,

  (SELECT COUNT(*) FROM voice_intakes
   WHERE status = 'needs_user_review'
   AND created_quote_id IS NOT NULL) as impossible_states,

  (SELECT COUNT(*) FROM voice_intakes
   WHERE status = 'needs_user_review'
   AND created_at < NOW() - INTERVAL '30 minutes') as stuck_reviews,

  (SELECT COUNT(*) FROM voice_intakes
   WHERE status = 'quote_created'
   AND created_at > NOW() - INTERVAL '24 hours') as successful_quotes_24h;

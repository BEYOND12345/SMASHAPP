/*
  # System Health Monitoring Queries

  Run these queries weekly to monitor quote creation quality and catch edge cases early.

  Date: 2026-01-02
  Version: 1.0
*/

-- ========================================
-- QUERY 1: Quote Line Items Health Check
-- ========================================
-- Purpose: Verify no quotes exist with zero line items (should ALWAYS be zero)
-- Expected: 0 rows
-- Alert if: Any rows returned

SELECT
  q.id AS quote_id,
  q.created_at,
  q.title,
  q.status,
  q.org_id,
  vi.id AS intake_id,
  vi.status AS intake_status
FROM quotes q
LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
LEFT JOIN voice_intakes vi ON vi.created_quote_id = q.id
WHERE q.created_at > NOW() - INTERVAL '7 days'
  AND qli.id IS NULL
GROUP BY q.id, q.created_at, q.title, q.status, q.org_id, vi.id, vi.status
ORDER BY q.created_at DESC;

-- ========================================
-- QUERY 2: Placeholder Usage Tracking
-- ========================================
-- Purpose: Monitor how often placeholders are being used (indicates extraction quality)
-- Expected: Low percentage (< 10% ideal)
-- Alert if: Percentage > 20% or trending upward

SELECT
  COUNT(DISTINCT q.id) AS total_quotes_created,
  COUNT(DISTINCT CASE
    WHEN qli.notes ILIKE '%Placeholder%'
    THEN q.id
  END) AS quotes_with_placeholders,
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN qli.notes ILIKE '%Placeholder%' THEN q.id END) /
    NULLIF(COUNT(DISTINCT q.id), 0),
    2
  ) AS placeholder_percentage,
  COUNT(CASE WHEN qli.notes ILIKE '%Placeholder%' THEN 1 END) AS total_placeholder_items
FROM quotes q
LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
WHERE q.created_at > NOW() - INTERVAL '7 days';

-- ========================================
-- QUERY 3: Placeholder Details Breakdown
-- ========================================
-- Purpose: See which quotes have placeholders and whether they've been edited
-- Expected: Most placeholders should be edited within 24 hours
-- Alert if: Many unedited placeholders remain

SELECT
  q.id AS quote_id,
  q.created_at,
  q.title,
  q.status,
  COUNT(qli.id) AS total_items,
  COUNT(CASE WHEN qli.notes ILIKE '%Placeholder%' THEN 1 END) AS placeholder_items,
  ARRAY_AGG(
    CASE
      WHEN qli.notes ILIKE '%Placeholder%'
      THEN qli.description
    END
  ) FILTER (WHERE qli.notes ILIKE '%Placeholder%') AS placeholder_descriptions
FROM quotes q
JOIN quote_line_items qli ON qli.quote_id = q.id
WHERE q.created_at > NOW() - INTERVAL '7 days'
GROUP BY q.id, q.created_at, q.title, q.status
HAVING COUNT(CASE WHEN qli.notes ILIKE '%Placeholder%' THEN 1 END) > 0
ORDER BY q.created_at DESC;

-- ========================================
-- QUERY 4: Stuck Intakes Check
-- ========================================
-- Purpose: Find voice intakes stuck in needs_user_review for > 24 hours
-- Expected: Few or none (users should resolve quickly)
-- Alert if: Many stuck intakes (indicates UX friction or bugs)

SELECT
  vi.id AS intake_id,
  vi.created_at,
  vi.status,
  vi.created_quote_id,
  q.title AS quote_title,
  q.status AS quote_status,
  EXTRACT(EPOCH FROM (NOW() - vi.created_at))/3600 AS hours_stuck,
  COUNT(qli.id) AS line_items_count
FROM voice_intakes vi
LEFT JOIN quotes q ON q.id = vi.created_quote_id
LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
WHERE vi.status = 'needs_user_review'
  AND vi.created_at < NOW() - INTERVAL '24 hours'
  AND vi.created_at > NOW() - INTERVAL '7 days'
GROUP BY vi.id, vi.created_at, vi.status, vi.created_quote_id, q.title, q.status
ORDER BY hours_stuck DESC;

-- ========================================
-- QUERY 5: Extraction Quality Trending
-- ========================================
-- Purpose: Track extraction quality over time by day
-- Expected: Stable or improving confidence scores
-- Alert if: Sudden drop in quality or increase in low confidence extractions

SELECT
  DATE(vi.created_at) AS extraction_date,
  COUNT(*) AS total_extractions,
  COUNT(CASE WHEN vi.status = 'needs_user_review' THEN 1 END) AS needs_review,
  ROUND(
    100.0 * COUNT(CASE WHEN vi.status = 'needs_user_review' THEN 1 END) /
    NULLIF(COUNT(*), 0),
    2
  ) AS needs_review_percentage,
  COUNT(CASE
    WHEN (vi.extraction_json->>'quality')::jsonb->>'overall_confidence' IS NOT NULL
    AND ((vi.extraction_json->>'quality')::jsonb->>'overall_confidence')::float < 0.6
    THEN 1
  END) AS low_confidence_count,
  ROUND(
    AVG(
      CASE
        WHEN (vi.extraction_json->>'quality')::jsonb->>'overall_confidence' IS NOT NULL
        THEN ((vi.extraction_json->>'quality')::jsonb->>'overall_confidence')::float
      END
    )::numeric,
    3
  ) AS avg_confidence
FROM voice_intakes vi
WHERE vi.created_at > NOW() - INTERVAL '7 days'
  AND vi.status IN ('extracted', 'needs_user_review', 'quote_created')
GROUP BY DATE(vi.created_at)
ORDER BY extraction_date DESC;

-- ========================================
-- QUERY 6: Quote Creation Performance
-- ========================================
-- Purpose: Monitor quote creation success rates
-- Expected: High success rate (> 95%)
-- Alert if: Success rate drops or many failed creations

SELECT
  DATE(created_at) AS creation_date,
  COUNT(*) AS total_intakes,
  COUNT(CASE WHEN created_quote_id IS NOT NULL THEN 1 END) AS quotes_created,
  COUNT(CASE WHEN created_quote_id IS NULL AND status NOT IN ('processing', 'transcribing') THEN 1 END) AS failed_creations,
  ROUND(
    100.0 * COUNT(CASE WHEN created_quote_id IS NOT NULL THEN 1 END) /
    NULLIF(COUNT(*), 0),
    2
  ) AS success_percentage
FROM voice_intakes
WHERE created_at > NOW() - INTERVAL '7 days'
  AND status NOT IN ('processing', 'transcribing')
GROUP BY DATE(created_at)
ORDER BY creation_date DESC;

-- ========================================
-- QUERY 7: Trigger Activations Log
-- ========================================
-- Purpose: Check if the invariant trigger is firing (indicates problems)
-- Expected: Few or zero activations (means extraction is working well)
-- Alert if: High activation rate (indicates systemic extraction failures)
-- Note: This relies on application logs. Use Supabase logs to search for [INVARIANT_VIOLATION]

-- Run this in Supabase logs or application monitoring:
-- Search for: "[INVARIANT_VIOLATION]" OR "[INVARIANT_FIX]"
-- Time range: Last 7 days
-- Expected: < 5% of quote creations

-- ========================================
-- SUMMARY DASHBOARD VIEW
-- ========================================
-- Purpose: Single query for weekly review dashboard
-- Expected: All green indicators

WITH quote_stats AS (
  SELECT
    COUNT(DISTINCT q.id) AS total_quotes,
    COUNT(DISTINCT CASE WHEN qli.notes ILIKE '%Placeholder%' THEN q.id END) AS quotes_with_placeholders,
    COUNT(CASE WHEN qli.id IS NULL THEN 1 END) AS quotes_with_zero_items
  FROM quotes q
  LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
  WHERE q.created_at > NOW() - INTERVAL '7 days'
),
intake_stats AS (
  SELECT
    COUNT(*) AS total_intakes,
    COUNT(CASE WHEN status = 'needs_user_review' AND created_at < NOW() - INTERVAL '24 hours' THEN 1 END) AS stuck_intakes,
    COUNT(CASE WHEN created_quote_id IS NOT NULL THEN 1 END) AS successful_quotes
  FROM voice_intakes
  WHERE created_at > NOW() - INTERVAL '7 days'
)
SELECT
  q.total_quotes,
  q.quotes_with_placeholders,
  ROUND(100.0 * q.quotes_with_placeholders / NULLIF(q.total_quotes, 0), 2) AS placeholder_rate_percent,
  q.quotes_with_zero_items AS CRITICAL_zero_item_quotes,
  i.total_intakes,
  i.successful_quotes,
  ROUND(100.0 * i.successful_quotes / NULLIF(i.total_intakes, 0), 2) AS success_rate_percent,
  i.stuck_intakes,
  CASE
    WHEN q.quotes_with_zero_items > 0 THEN 'CRITICAL: Zero item quotes exist!'
    WHEN q.placeholder_rate_percent > 20 THEN 'WARNING: High placeholder rate'
    WHEN i.success_rate_percent < 90 THEN 'WARNING: Low success rate'
    WHEN i.stuck_intakes > 10 THEN 'WARNING: Many stuck intakes'
    ELSE 'HEALTHY'
  END AS system_health
FROM quote_stats q, intake_stats i;

-- ========================================
-- RECOMMENDED ALERT THRESHOLDS
-- ========================================
/*
  CRITICAL (immediate action required):
  - quotes_with_zero_items > 0
  - success_rate_percent < 80%

  WARNING (investigate within 24 hours):
  - placeholder_rate_percent > 20%
  - success_rate_percent < 90%
  - stuck_intakes > 10
  - Sudden drops in avg_confidence (Query 5)

  NORMAL (monitor trends):
  - placeholder_rate_percent < 10%
  - success_rate_percent > 95%
  - stuck_intakes < 5
*/

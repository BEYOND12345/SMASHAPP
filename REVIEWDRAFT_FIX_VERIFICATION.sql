-- ============================================================================
-- ReviewDraft Fix Verification Queries
-- ============================================================================
-- Use these queries to verify the fix is working correctly.
-- Replace 'YOUR_QUOTE_ID' with the actual quote_id you're testing.

-- Query 1: Verify line items exist for a quote
-- Expected: Should return rows if line items exist
SELECT
  id,
  quote_id,
  org_id,
  position,
  item_type,
  description,
  quantity,
  unit_price_cents,
  line_total_cents,
  is_placeholder,
  is_needs_review,
  notes
FROM quote_line_items
WHERE quote_id = 'YOUR_QUOTE_ID'
ORDER BY position ASC, created_at ASC;

-- Query 2: Count line items by type
-- Expected: Shows breakdown of materials, labour, and fees
SELECT
  quote_id,
  item_type,
  COUNT(*) as item_count,
  SUM(line_total_cents) as total_cents
FROM quote_line_items
WHERE quote_id = 'YOUR_QUOTE_ID'
GROUP BY quote_id, item_type
ORDER BY item_type;

-- Query 3: Check for placeholder or needs_review items
-- Expected: Shows items that need user attention
SELECT
  id,
  quote_id,
  item_type,
  description,
  is_placeholder,
  is_needs_review,
  notes
FROM quote_line_items
WHERE quote_id = 'YOUR_QUOTE_ID'
  AND (is_placeholder = true OR is_needs_review = true OR notes LIKE '%Placeholder%')
ORDER BY position;

-- Query 4: Verify org_id is set on all line items
-- Expected: All items should have org_id matching the quote's org_id
SELECT
  qli.id,
  qli.quote_id,
  qli.org_id as line_item_org_id,
  q.org_id as quote_org_id,
  CASE
    WHEN qli.org_id IS NULL THEN 'MISSING_ORG_ID'
    WHEN qli.org_id != q.org_id THEN 'ORG_ID_MISMATCH'
    ELSE 'OK'
  END as org_id_status
FROM quote_line_items qli
JOIN quotes q ON q.id = qli.quote_id
WHERE qli.quote_id = 'YOUR_QUOTE_ID';

-- Query 5: Verify item_type normalization
-- Expected: All item_type values should be 'labour', 'materials', or 'fee' (lowercase)
SELECT
  id,
  quote_id,
  item_type,
  description,
  CASE
    WHEN item_type NOT IN ('labour', 'materials', 'fee') THEN 'INVALID_ITEM_TYPE'
    ELSE 'OK'
  END as item_type_status
FROM quote_line_items
WHERE quote_id = 'YOUR_QUOTE_ID';

-- Query 6: Check quote totals calculation
-- Expected: Quote totals should match sum of line items
SELECT
  q.id as quote_id,
  q.subtotal_cents as quote_subtotal,
  COALESCE(SUM(qli.line_total_cents), 0) as calculated_subtotal,
  q.subtotal_cents - COALESCE(SUM(qli.line_total_cents), 0) as difference,
  CASE
    WHEN q.subtotal_cents = COALESCE(SUM(qli.line_total_cents), 0) THEN 'MATCH'
    ELSE 'MISMATCH'
  END as totals_status
FROM quotes q
LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
WHERE q.id = 'YOUR_QUOTE_ID'
GROUP BY q.id, q.subtotal_cents;

-- Query 7: Get quote and voice intake details
-- Expected: Shows the relationship between quote and voice intake
SELECT
  q.id as quote_id,
  q.title,
  q.status as quote_status,
  q.org_id,
  q.customer_id,
  vi.id as intake_id,
  vi.status as intake_status,
  vi.created_quote_id,
  (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = q.id) as line_items_count
FROM quotes q
LEFT JOIN voice_intakes vi ON vi.created_quote_id = q.id
WHERE q.id = 'YOUR_QUOTE_ID';

-- Query 8: Check for items needing pricing
-- Expected: Shows materials with zero unit price
SELECT
  id,
  quote_id,
  item_type,
  description,
  quantity,
  unit,
  unit_price_cents,
  line_total_cents,
  notes
FROM quote_line_items
WHERE quote_id = 'YOUR_QUOTE_ID'
  AND item_type = 'materials'
  AND unit_price_cents = 0
ORDER BY position;

-- Query 9: Recent quotes for a user (replace USER_ID)
-- Expected: Shows recent quotes to find quote_ids for testing
SELECT
  q.id,
  q.title,
  q.created_at,
  q.status,
  (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = q.id) as line_items_count,
  vi.id as intake_id,
  vi.status as intake_status
FROM quotes q
LEFT JOIN voice_intakes vi ON vi.created_quote_id = q.id
WHERE q.org_id IN (
  SELECT org_id FROM users WHERE id = 'YOUR_USER_ID'
)
ORDER BY q.created_at DESC
LIMIT 10;

-- Query 10: Diagnostic query for ReviewDraft issues
-- Expected: Complete diagnostic info for troubleshooting
SELECT
  'QUOTE' as entity_type,
  q.id as entity_id,
  jsonb_build_object(
    'title', q.title,
    'org_id', q.org_id,
    'status', q.status,
    'customer_id', q.customer_id,
    'subtotal_cents', q.subtotal_cents,
    'line_items_count', (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = q.id),
    'has_placeholder_items', (SELECT COUNT(*) > 0 FROM quote_line_items WHERE quote_id = q.id AND is_placeholder = true),
    'has_needs_review_items', (SELECT COUNT(*) > 0 FROM quote_line_items WHERE quote_id = q.id AND is_needs_review = true),
    'has_zero_price_materials', (SELECT COUNT(*) > 0 FROM quote_line_items WHERE quote_id = q.id AND item_type = 'materials' AND unit_price_cents = 0)
  ) as details
FROM quotes q
WHERE q.id = 'YOUR_QUOTE_ID'

UNION ALL

SELECT
  'VOICE_INTAKE' as entity_type,
  vi.id as entity_id,
  jsonb_build_object(
    'status', vi.status,
    'created_quote_id', vi.created_quote_id,
    'customer_id', vi.customer_id,
    'has_extraction_json', vi.extraction_json IS NOT NULL,
    'requires_review', (vi.extraction_json->>'quality')::jsonb->>'requires_user_confirmation'
  ) as details
FROM voice_intakes vi
WHERE vi.created_quote_id = 'YOUR_QUOTE_ID';

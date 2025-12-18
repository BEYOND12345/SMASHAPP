-- ====================================================================
-- PHASE 4 & 5 VERIFICATION QUERIES
-- ====================================================================
-- Replace 'YOUR_INTAKE_ID_HERE' with your actual intake ID from the test
-- Example: '01234567-89ab-cdef-0123-456789abcdef'

-- ====================================================================
-- QUERY 1: Check Voice Intake Status
-- ====================================================================
-- Expected Results:
--   status = 'quote_created'
--   created_quote_id IS NOT NULL
--   user_confirmed = 'true'

SELECT
  id,
  status,
  created_quote_id,
  (extraction_json->'quality'->>'user_confirmed') AS user_confirmed,
  (extraction_json->'quality'->>'user_confirmed_at') AS user_confirmed_at,
  created_at,
  updated_at
FROM voice_intakes
WHERE id = 'YOUR_INTAKE_ID_HERE';


-- ====================================================================
-- QUERY 2: Check Created Quote
-- ====================================================================
-- Expected Results:
--   Exactly 1 row returned
--   status = 'draft'
--   grand_total_cents > 0

SELECT
  id,
  customer_id,
  quote_number,
  title,
  status,
  subtotal_cents,
  tax_cents,
  grand_total_cents,
  created_at,
  updated_at
FROM quotes
WHERE id = (SELECT created_quote_id FROM voice_intakes WHERE id = 'YOUR_INTAKE_ID_HERE');


-- ====================================================================
-- QUERY 3: Check Quote Line Items
-- ====================================================================
-- Expected Results:
--   line_item_count > 0
--   total_cents > 0
--   items array contains all line items with proper pricing

SELECT
  qli.quote_id,
  COUNT(*) AS line_item_count,
  COALESCE(SUM(qli.line_total_cents), 0) AS total_cents,
  json_agg(
    json_build_object(
      'position', qli.position,
      'type', qli.item_type,
      'description', qli.description,
      'quantity', qli.quantity,
      'unit', qli.unit,
      'unit_price_cents', qli.unit_price_cents,
      'line_total_cents', qli.line_total_cents
    ) ORDER BY qli.position
  ) AS items
FROM quote_line_items qli
WHERE qli.quote_id = (SELECT created_quote_id FROM voice_intakes WHERE id = 'YOUR_INTAKE_ID_HERE')
GROUP BY qli.quote_id;


-- ====================================================================
-- QUERY 4: Full Audit Trail (Optional)
-- ====================================================================
-- This shows the complete flow from voice intake to quote

SELECT
  vi.id AS intake_id,
  vi.status AS intake_status,
  vi.created_at AS intake_created,
  (vi.extraction_json->'quality'->>'user_confirmed')::boolean AS user_confirmed,
  q.id AS quote_id,
  q.quote_number,
  q.status AS quote_status,
  q.grand_total_cents,
  (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = q.id) AS line_items_count
FROM voice_intakes vi
LEFT JOIN quotes q ON vi.created_quote_id = q.id
WHERE vi.id = 'YOUR_INTAKE_ID_HERE';

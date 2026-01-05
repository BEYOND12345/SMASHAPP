-- =====================================================
-- CATALOG ALIAS DIAGNOSTIC QUERIES
-- =====================================================
-- Use these queries to verify and debug the alias matching system
-- Org ID: 19c5198a-3066-4aa7-8062-5daf602e615b
-- =====================================================

-- -----------------------------------------------------
-- 1. PROOF QUERIES (From Spec)
-- -----------------------------------------------------

-- Query A: Count aliases by org
SELECT org_id, count(*) as alias_count
FROM material_catalog_aliases
GROUP BY org_id
ORDER BY org_id;
-- Expected: 6 aliases for the org

-- Query B: Verify no duplicate normalized aliases per org
SELECT org_id, normalized_alias, count(*) as duplicate_count
FROM material_catalog_aliases
GROUP BY org_id, normalized_alias
HAVING count(*) > 1
ORDER BY duplicate_count DESC;
-- Expected: No rows (no duplicates)

-- Query C: Verify decking aliases
SELECT
  mca.alias_text,
  mca.normalized_alias,
  mca.priority,
  mci.name as catalog_item_name,
  mci.unit,
  mci.typical_low_price_cents,
  mci.typical_high_price_cents
FROM material_catalog_aliases mca
JOIN material_catalog_items mci ON mca.canonical_catalog_item_id = mci.id
WHERE mca.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND mca.normalized_alias IN ('decking', 'deck', 'deck boards')
ORDER BY mca.priority ASC;

-- -----------------------------------------------------
-- 2. VIEW ALL ALIASES
-- -----------------------------------------------------

-- Full alias table view
SELECT
  mca.alias_text,
  mca.normalized_alias,
  mca.priority,
  mci.name as catalog_item_name,
  mci.category,
  mci.unit,
  mci.typical_low_price_cents,
  mci.typical_high_price_cents,
  mca.created_at
FROM material_catalog_aliases mca
JOIN material_catalog_items mci ON mca.canonical_catalog_item_id = mci.id
WHERE mca.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
ORDER BY mci.category, mca.priority ASC;

-- -----------------------------------------------------
-- 3. FIND $0 MATERIALS (Problem Cases)
-- -----------------------------------------------------

-- Find recent quotes with $0 materials
SELECT
  q.id as quote_id,
  q.title as quote_title,
  q.created_at,
  qli.description,
  qli.quantity,
  qli.unit,
  qli.unit_price_cents,
  qli.catalog_item_id,
  qli.needs_pricing,
  qli.notes
FROM quote_line_items qli
JOIN quotes q ON qli.quote_id = q.id
WHERE q.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND qli.item_type = 'materials'
  AND (qli.unit_price_cents = 0 OR qli.unit_price_cents IS NULL OR qli.needs_pricing = true)
ORDER BY q.created_at DESC
LIMIT 30;

-- Count $0 materials by description (find patterns)
SELECT
  qli.description,
  count(*) as occurrence_count,
  count(DISTINCT q.id) as quote_count
FROM quote_line_items qli
JOIN quotes q ON qli.quote_id = q.id
WHERE q.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND qli.item_type = 'materials'
  AND (qli.unit_price_cents = 0 OR qli.unit_price_cents IS NULL)
  AND qli.created_at > now() - interval '30 days'
GROUP BY qli.description
ORDER BY occurrence_count DESC
LIMIT 20;
-- Use this to identify which phrases need new aliases

-- -----------------------------------------------------
-- 4. TEST SPECIFIC ALIAS LOOKUPS
-- -----------------------------------------------------

-- Test: Would "Decking materials" match?
-- Normalized form should be "decking"
SELECT
  mca.alias_text,
  mca.normalized_alias,
  mca.priority,
  mci.name as catalog_item_name
FROM material_catalog_aliases mca
JOIN material_catalog_items mci ON mca.canonical_catalog_item_id = mci.id
WHERE mca.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND mca.normalized_alias = 'decking'
ORDER BY mca.priority ASC
LIMIT 1;
-- Expected: Returns "decking materials" alias pointing to Merbau decking

-- Test: Would "Maroubra decking" match?
SELECT
  mca.alias_text,
  mca.normalized_alias,
  mca.priority,
  mci.name as catalog_item_name
FROM material_catalog_aliases mca
JOIN material_catalog_items mci ON mca.canonical_catalog_item_id = mci.id
WHERE mca.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND mca.normalized_alias = 'maroubra decking'
ORDER BY mca.priority ASC
LIMIT 1;
-- Expected: Returns "maroubra decking" alias with priority 10

-- Test: Would "deck timber" match?
SELECT
  mca.alias_text,
  mca.normalized_alias,
  mca.priority,
  mci.name as catalog_item_name
FROM material_catalog_aliases mca
JOIN material_catalog_items mci ON mca.canonical_catalog_item_id = mci.id
WHERE mca.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND mca.normalized_alias = 'deck'
ORDER BY mca.priority ASC
LIMIT 1;
-- Expected: Returns "deck timber" alias (normalized to "deck")

-- -----------------------------------------------------
-- 5. VERIFY RECENT QUOTE LINE ITEMS
-- -----------------------------------------------------

-- Show recent materials with alias matches
SELECT
  q.title as quote_title,
  qli.description,
  qli.catalog_item_id,
  qli.unit_price_cents,
  qli.catalog_match_confidence,
  qli.notes,
  qli.created_at
FROM quote_line_items qli
JOIN quotes q ON qli.quote_id = q.id
WHERE q.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND qli.item_type = 'materials'
  AND qli.notes LIKE '%Matched by alias:%'
ORDER BY qli.created_at DESC
LIMIT 20;
-- Should show materials matched via alias system

-- Show recent materials with high confidence (likely alias matches)
SELECT
  q.title as quote_title,
  qli.description,
  qli.catalog_match_confidence,
  qli.unit_price_cents,
  qli.notes,
  qli.created_at
FROM quote_line_items qli
JOIN quotes q ON qli.quote_id = q.id
WHERE q.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND qli.item_type = 'materials'
  AND qli.catalog_match_confidence = 1.0
ORDER BY qli.created_at DESC
LIMIT 20;

-- -----------------------------------------------------
-- 6. CATALOG ITEM ANALYSIS
-- -----------------------------------------------------

-- Show all decking-related catalog items
SELECT
  id,
  name,
  category,
  unit,
  typical_low_price_cents,
  typical_high_price_cents
FROM material_catalog_items
WHERE org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND (
    name ILIKE '%deck%'
    OR name ILIKE '%timber%'
  )
ORDER BY category, name;

-- Show items being referenced by aliases
SELECT DISTINCT
  mci.id,
  mci.name,
  mci.category,
  mci.unit,
  count(mca.id) as alias_count
FROM material_catalog_items mci
JOIN material_catalog_aliases mca ON mca.canonical_catalog_item_id = mci.id
WHERE mca.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
GROUP BY mci.id, mci.name, mci.category, mci.unit
ORDER BY alias_count DESC;

-- -----------------------------------------------------
-- 7. PERFORMANCE QUERIES
-- -----------------------------------------------------

-- Count materials matched by alias vs fuzzy
SELECT
  CASE
    WHEN notes LIKE '%Matched by alias:%' THEN 'alias'
    WHEN catalog_match_confidence = 1.0 THEN 'alias_or_manual'
    WHEN catalog_item_id IS NOT NULL THEN 'fuzzy'
    ELSE 'unmatched'
  END as match_type,
  count(*) as count
FROM quote_line_items
WHERE quote_id IN (
  SELECT id FROM quotes WHERE org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
)
  AND item_type = 'materials'
  AND created_at > now() - interval '7 days'
GROUP BY match_type
ORDER BY count DESC;

-- Average confidence by match type
SELECT
  CASE
    WHEN notes LIKE '%Matched by alias:%' THEN 'alias'
    WHEN catalog_item_id IS NOT NULL THEN 'fuzzy'
    ELSE 'unmatched'
  END as match_type,
  count(*) as count,
  avg(catalog_match_confidence) as avg_confidence,
  sum(CASE WHEN needs_pricing THEN 1 ELSE 0 END) as needs_pricing_count
FROM quote_line_items
WHERE quote_id IN (
  SELECT id FROM quotes WHERE org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
)
  AND item_type = 'materials'
  AND created_at > now() - interval '30 days'
GROUP BY match_type
ORDER BY count DESC;

-- -----------------------------------------------------
-- 8. MAINTENANCE QUERIES
-- -----------------------------------------------------

-- Add a new alias (template)
/*
INSERT INTO material_catalog_aliases (
  org_id,
  canonical_catalog_item_id,
  alias_text,
  normalized_alias,
  priority
) VALUES (
  '19c5198a-3066-4aa7-8062-5daf602e615b',
  'CATALOG_ITEM_UUID_HERE',
  'Human readable alias',
  'normalized alias', -- Use normalizeText() to calculate
  50 -- Priority (lower = higher priority)
);
*/

-- Update alias priority
/*
UPDATE material_catalog_aliases
SET priority = 25
WHERE org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND normalized_alias = 'deck boards';
*/

-- Delete an alias
/*
DELETE FROM material_catalog_aliases
WHERE org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND normalized_alias = 'old alias';
*/

-- Delete all aliases for an org (use with caution)
/*
DELETE FROM material_catalog_aliases
WHERE org_id = '19c5198a-3066-4aa7-8062-5daf602e615b';
*/

-- -----------------------------------------------------
-- 9. BACKFILL / REPAIR QUERIES
-- -----------------------------------------------------

-- Find quotes with $0 materials that COULD have been matched via alias
-- Run this to see if existing quotes would benefit from reprocessing
SELECT
  q.id as quote_id,
  q.title,
  qli.id as line_item_id,
  qli.description,
  qli.unit_price_cents as current_price,
  mca.alias_text as would_match_alias,
  mci.name as would_match_item,
  mci.typical_low_price_cents,
  mci.typical_high_price_cents
FROM quote_line_items qli
JOIN quotes q ON qli.quote_id = q.id
LEFT JOIN material_catalog_aliases mca ON (
  mca.org_id = q.org_id
  AND (
    lower(trim(qli.description)) = mca.normalized_alias
    OR lower(trim(qli.description)) LIKE '%' || mca.normalized_alias || '%'
  )
)
LEFT JOIN material_catalog_items mci ON mca.canonical_catalog_item_id = mci.id
WHERE q.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND qli.item_type = 'materials'
  AND (qli.unit_price_cents = 0 OR qli.unit_price_cents IS NULL)
  AND mca.id IS NOT NULL
ORDER BY q.created_at DESC
LIMIT 50;

-- Count how many historical items would benefit from aliases
SELECT
  mca.alias_text,
  count(DISTINCT qli.id) as affected_line_items,
  count(DISTINCT qli.quote_id) as affected_quotes
FROM quote_line_items qli
JOIN quotes q ON qli.quote_id = q.id
JOIN material_catalog_aliases mca ON (
  mca.org_id = q.org_id
  AND lower(trim(qli.description)) LIKE '%' || mca.normalized_alias || '%'
)
WHERE q.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND qli.item_type = 'materials'
  AND (qli.unit_price_cents = 0 OR qli.unit_price_cents IS NULL)
GROUP BY mca.alias_text
ORDER BY affected_line_items DESC;

-- -----------------------------------------------------
-- 10. DEBUGGING EDGE CASES
-- -----------------------------------------------------

-- Find materials that have catalog_item_id but still need_pricing = true
SELECT
  q.id as quote_id,
  qli.description,
  qli.catalog_item_id,
  qli.unit_price_cents,
  qli.needs_pricing,
  qli.notes
FROM quote_line_items qli
JOIN quotes q ON qli.quote_id = q.id
WHERE q.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND qli.item_type = 'materials'
  AND qli.catalog_item_id IS NOT NULL
  AND qli.needs_pricing = true
ORDER BY qli.created_at DESC
LIMIT 20;
-- This shouldn't happen with alias matches

-- Find aliases pointing to catalog items that don't exist
SELECT
  mca.alias_text,
  mca.canonical_catalog_item_id,
  mci.id as catalog_check
FROM material_catalog_aliases mca
LEFT JOIN material_catalog_items mci ON mca.canonical_catalog_item_id = mci.id
WHERE mca.org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND mci.id IS NULL;
-- Should be empty (foreign key constraint prevents this)

-- Find catalog items with no price ranges
SELECT
  id,
  name,
  category,
  unit,
  typical_low_price_cents,
  typical_high_price_cents
FROM material_catalog_items
WHERE org_id = '19c5198a-3066-4aa7-8062-5daf602e615b'
  AND (typical_low_price_cents IS NULL OR typical_high_price_cents IS NULL)
ORDER BY category, name;
-- Items without price ranges can't be used for alias matching

-- =====================================================
-- END OF DIAGNOSTIC QUERIES
-- =====================================================

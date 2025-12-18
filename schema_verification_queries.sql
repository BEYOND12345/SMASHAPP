-- ============================================================================
-- QUOTEPILOT PHASE 1 SCHEMA VERIFICATION QUERIES
-- Run these queries to detect issues, leaks, and inconsistencies
-- ============================================================================

-- ============================================================================
-- 1. ORPHANED DATA DETECTION
-- ============================================================================

-- Check for orphaned customer_addresses (customer deleted but addresses remain)
-- Should return 0 rows
SELECT 'Orphaned customer_addresses' as issue, ca.*
FROM customer_addresses ca
WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = ca.customer_id);

-- Check for orphaned quotes (customer deleted but quotes remain)
-- Should return 0 rows (but this is intentionally blocked by RESTRICT)
SELECT 'Orphaned quotes' as issue, q.*
FROM quotes q
WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = q.customer_id);

-- Check for orphaned quote_line_items (quote deleted but line items remain)
-- Should return 0 rows
SELECT 'Orphaned quote_line_items' as issue, qli.*
FROM quote_line_items qli
WHERE NOT EXISTS (SELECT 1 FROM quotes q WHERE q.id = qli.quote_id);

-- Check for users without organizations
-- Should return 0 rows
SELECT 'Users without organizations' as issue, u.*
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = u.org_id);

-- Check for quotes with mismatched org_id (quote.org_id != customer.org_id)
-- Should return 0 rows - this is a CRITICAL multi-tenant leak
SELECT 'Quote/Customer org_id mismatch' as issue,
  q.id as quote_id,
  q.org_id as quote_org_id,
  c.org_id as customer_org_id
FROM quotes q
JOIN customers c ON c.id = q.customer_id
WHERE q.org_id != c.org_id;

-- Check for line items with mismatched org_id (line_item.org_id != quote.org_id)
-- Should return 0 rows - this is a CRITICAL multi-tenant leak
SELECT 'Line item/Quote org_id mismatch' as issue,
  qli.id as line_item_id,
  qli.org_id as line_item_org_id,
  q.org_id as quote_org_id
FROM quote_line_items qli
JOIN quotes q ON q.id = qli.quote_id
WHERE qli.org_id != q.org_id;

-- ============================================================================
-- 2. FINANCIAL CORRECTNESS TESTS
-- ============================================================================

-- Check for quotes where calculated totals don't match stored totals
-- Should return 0 rows
WITH calculated_totals AS (
  SELECT
    q.id,
    q.org_id,
    COALESCE(SUM(CASE WHEN qli.item_type = 'labour' THEN qli.line_total_cents ELSE 0 END), 0) as calc_labour,
    COALESCE(SUM(CASE WHEN qli.item_type != 'labour' THEN qli.line_total_cents ELSE 0 END), 0) as calc_materials,
    COALESCE(SUM(qli.line_total_cents), 0) as calc_subtotal
  FROM quotes q
  LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
  GROUP BY q.id, q.org_id
)
SELECT
  'Quote total mismatch' as issue,
  q.id,
  q.quote_number,
  q.labour_subtotal_cents as stored_labour,
  ct.calc_labour,
  q.materials_subtotal_cents as stored_materials,
  ct.calc_materials,
  q.subtotal_cents as stored_subtotal,
  ct.calc_subtotal
FROM quotes q
JOIN calculated_totals ct ON ct.id = q.id
WHERE
  q.labour_subtotal_cents != ct.calc_labour
  OR q.materials_subtotal_cents != ct.calc_materials
  OR q.subtotal_cents != ct.calc_subtotal;

-- Check for negative totals (excluding allowed discount item types)
-- Should return 0 rows
SELECT 'Negative line total' as issue, qli.*
FROM quote_line_items qli
WHERE qli.line_total_cents < 0 AND qli.item_type != 'discount';

-- Check for negative grand totals
-- Should return 0 rows
SELECT 'Negative grand total' as issue, q.*
FROM quotes q
WHERE q.grand_total_cents < 0;

-- Check for quotes with zero line items but non-zero totals
-- Should return 0 rows
SELECT 'Quote with totals but no line items' as issue, q.*
FROM quotes q
WHERE NOT EXISTS (SELECT 1 FROM quote_line_items qli WHERE qli.quote_id = q.id)
  AND (q.labour_subtotal_cents != 0 OR q.materials_subtotal_cents != 0 OR q.subtotal_cents != 0 OR q.grand_total_cents != 0);

-- ============================================================================
-- 3. DUPLICATE DETECTION
-- ============================================================================

-- Check for duplicate customers (deduplication_key should prevent this)
-- Should return 0 rows
SELECT
  'Duplicate customers' as issue,
  org_id,
  deduplication_key,
  COUNT(*) as duplicate_count,
  array_agg(id) as customer_ids
FROM customers
WHERE email IS NOT NULL
GROUP BY org_id, deduplication_key
HAVING COUNT(*) > 1;

-- Check for duplicate quote numbers within an org
-- Should return 0 rows
SELECT
  'Duplicate quote numbers' as issue,
  org_id,
  quote_number,
  COUNT(*) as duplicate_count,
  array_agg(id) as quote_ids
FROM quotes
GROUP BY org_id, quote_number
HAVING COUNT(*) > 1;

-- Check for duplicate approval tokens
-- Should return 0 rows
SELECT
  'Duplicate approval tokens' as issue,
  approval_token,
  COUNT(*) as duplicate_count,
  array_agg(id) as quote_ids
FROM quotes
WHERE approval_token IS NOT NULL
GROUP BY approval_token
HAVING COUNT(*) > 1;

-- Check for multiple default addresses per customer
-- Should return 0 rows or be handled by application logic
SELECT
  'Multiple default addresses' as issue,
  customer_id,
  COUNT(*) as default_count,
  array_agg(id) as address_ids
FROM customer_addresses
WHERE is_default = true
GROUP BY customer_id
HAVING COUNT(*) > 1;

-- ============================================================================
-- 4. RLS SECURITY VALIDATION
-- ============================================================================

-- Check for tables without RLS enabled
-- Should return 0 rows for our core tables
SELECT
  'Table without RLS' as issue,
  schemaname,
  tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'users', 'customers', 'customer_addresses', 'quotes', 'quote_line_items')
  AND rowsecurity = false;

-- Check for tables with no policies (RLS enabled but no access rules)
-- Should return 0 rows for our core tables
SELECT
  'Table with RLS but no policies' as issue,
  t.schemaname,
  t.tablename
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.tablename IN ('organizations', 'users', 'customers', 'customer_addresses', 'quotes', 'quote_line_items')
  AND t.rowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = t.schemaname
    AND p.tablename = t.tablename
  );

-- List all public policies (should only be on quotes and quote_line_items)
SELECT
  'Public policy inventory' as info,
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND 'public' = ANY(roles::text[])
ORDER BY tablename, policyname;

-- ============================================================================
-- 5. QUOTE STATE VALIDATION
-- ============================================================================

-- Check for invalid quote status values
-- Should return 0 rows
SELECT 'Invalid quote status' as issue, q.*
FROM quotes q
WHERE q.status NOT IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'invoiced');

-- Check for accepted quotes without acceptance metadata
-- Should return 0 rows
SELECT 'Accepted quote missing metadata' as issue, q.*
FROM quotes q
WHERE q.status = 'accepted'
  AND (q.accepted_at IS NULL OR q.accepted_by_email IS NULL);

-- Check for declined quotes without decline reason
-- This is a WARNING, not necessarily an error
SELECT 'Declined quote without reason' as warning, q.*
FROM quotes q
WHERE q.status = 'declined'
  AND (q.declined_at IS NULL OR q.declined_reason IS NULL);

-- Check for sent quotes without sent_at timestamp
-- Should return 0 rows
SELECT 'Sent quote without timestamp' as issue, q.*
FROM quotes q
WHERE q.status = 'sent'
  AND q.sent_at IS NULL;

-- Check for quotes accepted after expiration
-- Should return 0 rows or require business rule enforcement
SELECT 'Quote accepted after expiration' as issue, q.*
FROM quotes q
WHERE q.status = 'accepted'
  AND q.expires_at IS NOT NULL
  AND q.accepted_at > q.expires_at;

-- ============================================================================
-- 6. PUBLIC QUOTE SECURITY
-- ============================================================================

-- Check for public quotes without approval tokens
-- Should return 0 rows
SELECT 'Public quote without token' as issue, q.*
FROM quotes q
WHERE q.is_public = true
  AND q.approval_token IS NULL;

-- Count approval token entropy (should be UUID v4)
-- All should have valid UUIDs
SELECT
  'Approval token format check' as info,
  COUNT(*) as total_quotes,
  COUNT(approval_token) as quotes_with_tokens,
  COUNT(CASE WHEN approval_token::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN 1 END) as valid_uuid_v4_tokens
FROM quotes;

-- ============================================================================
-- 7. FOREIGN KEY INTEGRITY
-- ============================================================================

-- Check for quotes with invalid address references
-- Should return 0 rows
SELECT 'Quote with invalid address' as issue, q.*
FROM quotes q
WHERE q.address_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM customer_addresses ca WHERE ca.id = q.address_id);

-- Check for quotes where address belongs to different customer
-- Should return 0 rows - this is a CRITICAL data integrity issue
SELECT 'Quote address/customer mismatch' as issue, q.id, q.customer_id, q.address_id, ca.customer_id as address_customer_id
FROM quotes q
JOIN customer_addresses ca ON ca.id = q.address_id
WHERE q.address_id IS NOT NULL
  AND q.customer_id != ca.customer_id;

-- ============================================================================
-- 8. CURRENCY AND TAX VALIDATION
-- ============================================================================

-- Check for invalid currency codes (must be 3 uppercase letters)
-- Should return 0 rows
SELECT 'Invalid currency code' as issue, 'organizations' as table_name, id, default_currency as currency
FROM organizations
WHERE default_currency !~ '^[A-Z]{3}$'
UNION ALL
SELECT 'Invalid currency code' as issue, 'quotes' as table_name, id, currency
FROM quotes
WHERE currency !~ '^[A-Z]{3}$';

-- Check for invalid tax rates (must be between 0 and 100)
-- Should return 0 rows
SELECT 'Invalid tax rate' as issue, 'organizations' as table_name, id, default_tax_rate as tax_rate
FROM organizations
WHERE default_tax_rate < 0 OR default_tax_rate > 100
UNION ALL
SELECT 'Invalid tax rate' as issue, 'quotes' as table_name, id, default_tax_rate as tax_rate
FROM quotes
WHERE default_tax_rate < 0 OR default_tax_rate > 100;

-- ============================================================================
-- 9. PERFORMANCE HOTSPOT DETECTION
-- ============================================================================

-- Check for missing indexes on foreign keys
-- This query checks if all foreign keys have corresponding indexes
SELECT
  'Foreign key without index' as issue,
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
  AND conrelid::regclass::text IN ('customer_addresses', 'customers', 'quotes', 'quote_line_items', 'users')
  AND NOT EXISTS (
    SELECT 1 FROM pg_index
    WHERE indrelid = conrelid
      AND conkey::text = indkey::text
  );

-- Find tables without indexes (excluding very small lookup tables)
SELECT
  'Table without indexes' as warning,
  schemaname,
  tablename
FROM pg_tables t
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'users', 'customers', 'customer_addresses', 'quotes', 'quote_line_items')
  AND NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = t.schemaname
    AND i.tablename = t.tablename
  );

-- ============================================================================
-- 10. DATA CONSISTENCY CHECKS
-- ============================================================================

-- Check for line items with invalid quantities
-- Should return 0 rows
SELECT 'Invalid quantity' as issue, qli.*
FROM quote_line_items qli
WHERE qli.quantity <= 0;

-- Check for line items with invalid discount percentages
-- Should return 0 rows
SELECT 'Invalid discount percentage' as issue, qli.*
FROM quote_line_items qli
WHERE qli.discount_percent < 0 OR qli.discount_percent > 100;

-- Check for customers with no contact information
-- This is a WARNING - may be legitimate but worth reviewing
SELECT 'Customer without contact info' as warning, c.*
FROM customers c
WHERE c.email IS NULL AND c.phone IS NULL;

-- Check for organizations without required information
-- This is a WARNING - may need completion
SELECT 'Organization missing key info' as warning, o.*
FROM organizations o
WHERE o.name IS NULL OR o.name = '';

-- ============================================================================
-- 11. MULTI-TENANT ISOLATION VERIFICATION
-- ============================================================================

-- Verify all customers belong to valid organizations
SELECT 'Customer with invalid org' as issue, c.*
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = c.org_id);

-- Verify all quotes belong to valid organizations
SELECT 'Quote with invalid org' as issue, q.*
FROM quotes q
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = q.org_id);

-- Verify all line items belong to valid organizations
SELECT 'Line item with invalid org' as issue, qli.*
FROM quote_line_items qli
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = qli.org_id);

-- ============================================================================
-- 12. LEGACY TABLE COMPATIBILITY CHECK
-- ============================================================================

-- Compare jobs table (legacy) with quotes table (new)
-- This helps identify migration requirements
SELECT
  'Legacy data inventory' as info,
  'jobs table' as source,
  COUNT(*) as total_records,
  COUNT(CASE WHEN type = 'estimate' THEN 1 END) as estimates,
  COUNT(CASE WHEN type = 'invoice' THEN 1 END) as invoices,
  COUNT(CASE WHEN status = 'draft' THEN 1 END) as drafts,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent
FROM jobs;

-- Check if user_profiles need migration to organizations
SELECT
  'Legacy profiles inventory' as info,
  COUNT(*) as total_profiles
FROM user_profiles;

-- ============================================================================
-- END OF VERIFICATION QUERIES
-- ============================================================================
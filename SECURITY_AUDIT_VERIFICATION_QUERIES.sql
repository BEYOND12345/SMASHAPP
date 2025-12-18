-- ============================================================================
-- SECURITY AUDIT VERIFICATION QUERIES
-- Use these queries to verify security hardening is working correctly
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: RLS VERIFICATION
-- ----------------------------------------------------------------------------

-- Query 1.1: Verify ALL tables have RLS enabled
SELECT
  n.nspname as schema,
  c.relname as table,
  c.relrowsecurity as rls_enabled,
  CASE
    WHEN c.relrowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- Expected: All tables show rls_enabled = true


-- Query 1.2: Check for dangerous policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles::text,
  cmd,
  qual,
  with_check,
  CASE
    WHEN qual = 'true' AND roles::text NOT LIKE '%service_role%' THEN '❌ DANGEROUS: Uses true for non-service-role'
    WHEN with_check = 'true' AND roles::text NOT LIKE '%service_role%' THEN '❌ DANGEROUS: Uses true for non-service-role'
    WHEN roles::text LIKE '%public%' AND cmd = 'INSERT' THEN '❌ DANGEROUS: Public INSERT'
    ELSE '✅ OK'
  END as risk_assessment
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY risk_assessment DESC, tablename;

-- Expected: All policies show '✅ OK' except service_role policies


-- Query 1.3: Count policies per table
SELECT
  tablename,
  COUNT(*) as total_policies,
  COUNT(*) FILTER (WHERE cmd = 'SELECT') as select_policies,
  COUNT(*) FILTER (WHERE cmd = 'INSERT') as insert_policies,
  COUNT(*) FILTER (WHERE cmd = 'UPDATE') as update_policies,
  COUNT(*) FILTER (WHERE cmd = 'DELETE') as delete_policies,
  COUNT(*) FILTER (WHERE cmd = 'ALL') as all_policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- Expected: Most tables have 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- Some exceptions: organizations, users, user_pricing_profiles (no INSERT for authenticated)


-- Query 1.4: Verify no public INSERT policies exist
SELECT
  tablename,
  policyname,
  roles::text,
  cmd,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND roles::text LIKE '%public%'
  AND cmd = 'INSERT';

-- Expected: ZERO ROWS (no public INSERT policies)


-- ----------------------------------------------------------------------------
-- SECTION 2: RATE LIMITING VERIFICATION
-- ----------------------------------------------------------------------------

-- Query 2.1: Verify rate_limit_buckets table exists and has correct structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'rate_limit_buckets'
ORDER BY ordinal_position;

-- Expected: 8 columns (id, user_id, endpoint, call_count, window_start, window_end, created_at, updated_at)


-- Query 2.2: Check rate limit function exists
SELECT
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'check_rate_limit';

-- Expected: 1 row with routine_type = 'FUNCTION', return_type = 'jsonb'


-- Query 2.3: View current rate limits for a specific user (replace YOUR_USER_ID)
SELECT
  endpoint,
  call_count,
  window_start,
  window_end,
  EXTRACT(EPOCH FROM (window_end - now())) / 60 as minutes_remaining,
  CASE
    WHEN window_end < now() THEN '❌ EXPIRED'
    WHEN call_count >= 10 AND endpoint = 'create-draft-quote' THEN '❌ RATE LIMITED'
    WHEN call_count >= 20 AND endpoint IN ('extract-quote-data', 'transcribe-voice-intake') THEN '❌ RATE LIMITED'
    WHEN call_count >= 50 AND endpoint = 'openai-proxy' THEN '❌ RATE LIMITED'
    ELSE '✅ OK'
  END as status
FROM rate_limit_buckets
WHERE user_id = 'YOUR_USER_ID'  -- Replace with actual user ID
ORDER BY window_end DESC;

-- Expected: Shows active rate limit buckets for user


-- Query 2.4: Summary of rate limit usage across all users
SELECT
  endpoint,
  COUNT(*) as active_buckets,
  AVG(call_count) as avg_calls,
  MAX(call_count) as max_calls,
  COUNT(*) FILTER (WHERE call_count >= 10 AND endpoint = 'create-draft-quote') as limited_users
FROM rate_limit_buckets
WHERE window_end > now()
GROUP BY endpoint
ORDER BY endpoint;

-- Expected: Shows rate limit usage patterns


-- ----------------------------------------------------------------------------
-- SECTION 3: STORAGE VERIFICATION
-- ----------------------------------------------------------------------------

-- Query 3.1: List all storage buckets and their public status
SELECT
  id,
  name,
  public,
  CASE
    WHEN name = 'voice-intakes' AND public = true THEN '❌ WARNING: voice-intakes should be private'
    WHEN name = 'profile-logos' AND public = false THEN '⚠️ NOTE: profile-logos could be public'
    ELSE '✅ OK'
  END as status
FROM storage.buckets
ORDER BY name;

-- Expected:
-- voice-intakes: public = false ✅
-- profile-logos: public = true ✅


-- Query 3.2: List all storage policies
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  SUBSTRING(qual, 1, 80) as qual_preview,
  SUBSTRING(with_check, 1, 80) as with_check_preview
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, policyname;

-- Expected: ~10 storage policies, all scoped to user_id or service_role


-- ----------------------------------------------------------------------------
-- SECTION 4: VOICE-TO-QUOTE FLOW VERIFICATION
-- ----------------------------------------------------------------------------

-- Query 4.1: Get voice intake status for user (replace YOUR_USER_ID)
SELECT
  id,
  status,
  created_at,
  audio_duration_seconds,
  LENGTH(transcript_text) as transcript_length,
  created_quote_id,
  (extraction_json->'quality'->>'overall_confidence')::numeric as confidence,
  CASE
    WHEN status = 'captured' THEN '1️⃣ Captured'
    WHEN status = 'transcribed' THEN '2️⃣ Transcribed'
    WHEN status = 'extracted' THEN '3️⃣ Extracted'
    WHEN status = 'needs_user_review' THEN '⚠️ Needs Review'
    WHEN status = 'quote_created' THEN '✅ Quote Created'
    ELSE status
  END as workflow_stage
FROM voice_intakes
WHERE user_id = 'YOUR_USER_ID'  -- Replace with actual user ID
ORDER BY created_at DESC
LIMIT 10;

-- Expected: Shows intake progression through workflow


-- Query 4.2: Verify quote was created from intake (replace YOUR_INTAKE_ID)
SELECT
  vi.id as intake_id,
  vi.status as intake_status,
  vi.created_quote_id,
  q.id as quote_id,
  q.quote_number,
  q.title,
  q.status as quote_status,
  q.grand_total_cents,
  COUNT(qli.id) as line_item_count,
  COALESCE(SUM(qli.line_total_cents), 0) as calculated_total,
  CASE
    WHEN q.grand_total_cents = COALESCE(SUM(qli.line_total_cents), 0) THEN '✅ Totals match'
    ELSE '❌ Total mismatch'
  END as validation
FROM voice_intakes vi
LEFT JOIN quotes q ON q.id = vi.created_quote_id
LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
WHERE vi.id = 'YOUR_INTAKE_ID'  -- Replace with actual intake ID
GROUP BY vi.id, vi.status, vi.created_quote_id, q.id, q.quote_number, q.title, q.status, q.grand_total_cents;

-- Expected: Shows quote details and validates totals match


-- Query 4.3: Verify line items for quote (replace YOUR_INTAKE_ID)
SELECT
  qli.position,
  qli.item_type,
  qli.description,
  qli.quantity,
  qli.unit,
  qli.unit_price_cents / 100.0 as unit_price_dollars,
  qli.line_total_cents / 100.0 as line_total_dollars,
  qli.notes,
  CASE
    WHEN qli.line_total_cents = ROUND(qli.quantity * qli.unit_price_cents) THEN '✅ Math correct'
    ELSE '❌ Math error'
  END as validation
FROM quote_line_items qli
WHERE qli.quote_id = (
  SELECT created_quote_id
  FROM voice_intakes
  WHERE id = 'YOUR_INTAKE_ID'  -- Replace with actual intake ID
)
ORDER BY qli.position;

-- Expected: Shows all line items with correct calculations


-- ----------------------------------------------------------------------------
-- SECTION 5: AUTHENTICATION AND USER VERIFICATION
-- ----------------------------------------------------------------------------

-- Query 5.1: Verify user setup after signup (replace YOUR_USER_ID)
SELECT
  u.id,
  u.email,
  u.full_name,
  u.role,
  u.org_id,
  o.name as org_name,
  upp.hourly_rate_cents / 100.0 as hourly_rate_dollars,
  upp.is_active as has_active_pricing,
  CASE
    WHEN u.org_id IS NULL THEN '❌ Missing org_id'
    WHEN upp.id IS NULL THEN '❌ Missing pricing profile'
    WHEN NOT upp.is_active THEN '⚠️ Pricing profile not active'
    ELSE '✅ Complete'
  END as setup_status
FROM users u
LEFT JOIN organizations o ON o.id = u.org_id
LEFT JOIN user_pricing_profiles upp ON upp.user_id = u.id AND upp.is_active = true
WHERE u.id = 'YOUR_USER_ID';  -- Replace with actual user ID

-- Expected: User has org_id, active pricing profile, and setup_status = '✅ Complete'


-- Query 5.2: Check for orphaned users (users without org or pricing)
SELECT
  u.id,
  u.email,
  u.created_at,
  CASE
    WHEN u.org_id IS NULL THEN '❌ No org'
    WHEN NOT EXISTS (SELECT 1 FROM user_pricing_profiles WHERE user_id = u.id AND is_active = true) THEN '❌ No active pricing'
    ELSE '✅ OK'
  END as issue
FROM users u
WHERE u.org_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM user_pricing_profiles WHERE user_id = u.id AND is_active = true);

-- Expected: ZERO ROWS (all users properly set up)


-- ----------------------------------------------------------------------------
-- SECTION 6: EDGE FUNCTION LOGS (Check Supabase Dashboard)
-- ----------------------------------------------------------------------------

-- These queries show what to look for in Supabase logs.
-- Go to: Supabase Dashboard → Logs → Edge Functions

-- Expected log entries for successful create-draft-quote:
-- [AUTH] User authenticated user_id=...
-- [REVIEW_FLOW] CREATE_DRAFT_QUOTE_START intake_id=... user_id=...
-- [REVIEW_FLOW] CREATE_DRAFT_QUOTE_LOCK_ACQUIRED intake_id=...
-- [QUOTE_CREATE] Starting quote creation ...
-- [REVIEW_FLOW] CREATE_DRAFT_QUOTE_CREATED quote_id=... line_items_count=... total_cents=...

-- Expected log entries for rate limited request:
-- [AUTH] User authenticated user_id=...
-- [SECURITY] RATE_LIMIT user_id=... endpoint=create-draft-quote

-- Expected log entries for auth failure:
-- [AUTH] Missing authorization header
-- OR
-- [AUTH] Unauthorized request error=...


-- ----------------------------------------------------------------------------
-- SECTION 7: PRICING PROFILE VERIFICATION
-- ----------------------------------------------------------------------------

-- Query 7.1: Test get_effective_pricing_profile function (replace YOUR_USER_ID)
SELECT * FROM get_effective_pricing_profile('YOUR_USER_ID');

-- Expected: Returns pricing profile with all fields populated


-- Query 7.2: Verify pricing profile defaults
SELECT
  user_id,
  hourly_rate_cents / 100.0 as hourly_rate,
  materials_markup_percent,
  default_tax_rate,
  default_currency,
  is_active,
  CASE
    WHEN hourly_rate_cents IS NULL OR hourly_rate_cents <= 0 THEN '❌ Invalid hourly rate'
    WHEN materials_markup_percent IS NULL THEN '❌ Missing markup'
    WHEN NOT is_active THEN '⚠️ Inactive'
    ELSE '✅ OK'
  END as status
FROM user_pricing_profiles
ORDER BY created_at DESC;

-- Expected: All profiles have valid rates and one active profile per user


-- ----------------------------------------------------------------------------
-- SECTION 8: CLEANUP AND MAINTENANCE
-- ----------------------------------------------------------------------------

-- Query 8.1: Clean up expired rate limit buckets
-- (This should be run periodically via cron or manual trigger)
SELECT cleanup_old_rate_limits();

-- Expected: No error, returns void


-- Query 8.2: Check for stale rate limit buckets
SELECT
  COUNT(*) as expired_buckets,
  MIN(window_end) as oldest_expired
FROM rate_limit_buckets
WHERE window_end < now() - interval '24 hours';

-- Expected: Should be 0 if cleanup function runs regularly


-- Query 8.3: Check storage usage
SELECT
  bucket_id,
  COUNT(*) as file_count,
  SUM(octet_length(metadata)) as metadata_size_bytes
FROM storage.objects
GROUP BY bucket_id;

-- Expected: Shows storage usage by bucket


-- ----------------------------------------------------------------------------
-- SECTION 9: SECURITY AUDIT SUMMARY
-- ----------------------------------------------------------------------------

-- Query 9.1: Security health check
SELECT
  'RLS Tables' as check_name,
  COUNT(*) as count,
  CASE WHEN COUNT(*) = 17 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity

UNION ALL

SELECT
  'Dangerous Policies',
  COUNT(*),
  CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    (qual = 'true' AND roles::text NOT LIKE '%service_role%')
    OR (with_check = 'true' AND roles::text NOT LIKE '%service_role%')
    OR (roles::text LIKE '%public%' AND cmd = 'INSERT')
  )

UNION ALL

SELECT
  'Rate Limit Infrastructure',
  COUNT(*),
  CASE WHEN COUNT(*) = 1 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'rate_limit_buckets'

UNION ALL

SELECT
  'Private Voice Storage',
  COUNT(*),
  CASE WHEN COUNT(*) = 1 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM storage.buckets
WHERE name = 'voice-intakes'
  AND public = false;

-- Expected: All checks show '✅ PASS'


-- ============================================================================
-- END OF VERIFICATION QUERIES
-- ============================================================================

-- NOTES:
-- 1. Replace YOUR_USER_ID with actual user ID from auth.users
-- 2. Replace YOUR_INTAKE_ID with actual intake ID from voice_intakes
-- 3. Check Supabase Dashboard logs for [AUTH], [SECURITY], [REVIEW_FLOW] tags
-- 4. Run cleanup_old_rate_limits() periodically to prevent table bloat
-- 5. All queries should be run as authenticated user or service role

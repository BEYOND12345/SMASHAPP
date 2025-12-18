# Supabase Dashboard Configuration Required

The following security improvements require manual configuration in the Supabase Dashboard and cannot be automated via migrations.

## 1. Auth DB Connection Strategy

**Issue:** Your project's Auth server is configured to use at most 10 connections. Increasing the instance size without manually adjusting this number will not improve the performance of the Auth server.

**Action Required:**
1. Go to Supabase Dashboard → Project Settings → Database
2. Find the "Auth Connection Pooling" section
3. Change from fixed connection count (10) to percentage-based allocation
4. Recommended: Set to 10-15% of total available connections

**Why:** Percentage-based allocation automatically scales with your database instance size, ensuring Auth server performance improves when you upgrade.

## 2. Leaked Password Protection

**Issue:** Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org. This feature is currently disabled.

**Action Required:**
1. Go to Supabase Dashboard → Authentication → Providers
2. Scroll to "Security and Protection" section
3. Enable "Leaked Password Protection"
4. This will check user passwords against the HaveIBeenPwned database during signup and password changes

**Why:** This prevents users from using passwords that have been exposed in data breaches, significantly improving account security.

## Summary

Both of these security enhancements are one-time configuration changes in the Supabase Dashboard. They do not require code changes and will take effect immediately after being enabled.

## Completed Fixes

The following issues have been fixed via database migrations:
- ✅ Added 7 missing foreign key indexes
- ✅ Optimized 50+ RLS policies with (select auth.uid()) pattern
- ✅ Removed 3 duplicate indexes
- ✅ Set immutable search_path on 37 database functions
- ✅ Fixed multiple permissive policies on jobs table
- ✅ Dropped 10 unused indexes that were redundant or unlikely to be used

## Remaining Indexes (Intentionally Kept)

The following indexes show as "unused" but are kept because they're performance-critical for common query patterns:
- `idx_jobs_user_id` - Critical for "my jobs" queries
- `idx_jobs_status` - Critical for filtering by status
- `idx_invoices_customer` - Critical for customer invoice lists
- `idx_customers_org_id` - Critical for multi-tenant filtering
- `idx_addresses_org` - Critical for multi-tenant filtering
- `voice_intakes_org_id_idx` - Critical for multi-tenant filtering
- `idx_line_items_quote` - Critical for quote line item queries
- `idx_quote_line_items_catalog_id` - Critical for product lookups
- `idx_integration_*` - Critical for QuickBooks sync operations
- `idx_qb_*_org` - Critical for QuickBooks tenant filtering
- Foreign key indexes on address_id, created_by_user_id, org_id - Critical for join performance

These indexes will be used as the application scales and query patterns develop.

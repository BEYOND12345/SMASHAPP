/*
  # Fix Performance and Security Issues from Supabase Dashboard

  1. Performance Fixes
    - Add missing index on voice_intakes.customer_id (foreign key)
    - Optimize all RLS policies to use (select auth.uid()) pattern
    
  2. RLS Performance Optimization
    - Replace auth.uid() with (select auth.uid()) in all policies
    - This prevents re-evaluation of auth function for each row
    - Applies to: integration_entity_map, qb_oauth_states, rate_limit_buckets
    - Plus all other tables for consistency
    
  3. Security Impact
    - No security changes, only performance improvements
    - All policies maintain same security guarantees
    
  Note: Auth DB Connection and Leaked Password Protection require manual dashboard config
*/

-- ============================================================================
-- PART 1: ADD MISSING INDEXES
-- ============================================================================

-- Add missing index on voice_intakes.customer_id foreign key
CREATE INDEX IF NOT EXISTS idx_voice_intakes_customer_id 
  ON voice_intakes(customer_id) 
  WHERE customer_id IS NOT NULL;


-- ============================================================================
-- PART 2: OPTIMIZE RLS POLICIES - USE (SELECT auth.uid()) PATTERN
-- ============================================================================

-- This optimization prevents auth.uid() from being re-evaluated for each row
-- The (select auth.uid()) pattern evaluates once per query instead

-- ----------------------------------------------------------------------------
-- integration_entity_map policies
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Org members can view integration maps" ON integration_entity_map;
CREATE POLICY "Org members can view integration maps"
  ON integration_entity_map FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members can create integration maps" ON integration_entity_map;
CREATE POLICY "Org members can create integration maps"
  ON integration_entity_map FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members can update integration maps" ON integration_entity_map;
CREATE POLICY "Org members can update integration maps"
  ON integration_entity_map FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members can delete integration maps" ON integration_entity_map;
CREATE POLICY "Org members can delete integration maps"
  ON integration_entity_map FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );


-- ----------------------------------------------------------------------------
-- qb_oauth_states policies
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Org members can view OAuth states" ON qb_oauth_states;
CREATE POLICY "Org members can view OAuth states"
  ON qb_oauth_states FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members can create OAuth states" ON qb_oauth_states;
CREATE POLICY "Org members can create OAuth states"
  ON qb_oauth_states FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members can update OAuth states" ON qb_oauth_states;
CREATE POLICY "Org members can update OAuth states"
  ON qb_oauth_states FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members can delete OAuth states" ON qb_oauth_states;
CREATE POLICY "Org members can delete OAuth states"
  ON qb_oauth_states FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );


-- ----------------------------------------------------------------------------
-- rate_limit_buckets policies
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own rate limits" ON rate_limit_buckets;
CREATE POLICY "Users can view own rate limits"
  ON rate_limit_buckets FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ----------------------------------------------------------------------------
-- All other tables - optimize for consistency
-- ----------------------------------------------------------------------------

-- users table
DROP POLICY IF EXISTS "Users can view own record" ON users;
CREATE POLICY "Users can view own record"
  ON users FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users cannot delete themselves" ON users;
CREATE POLICY "Users cannot delete themselves"
  ON users FOR DELETE
  TO authenticated
  USING (false);


-- user_profiles table
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));


-- user_pricing_profiles table
DROP POLICY IF EXISTS "Users can view own pricing profile" ON user_pricing_profiles;
CREATE POLICY "Users can view own pricing profile"
  ON user_pricing_profiles FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own pricing profile" ON user_pricing_profiles;
CREATE POLICY "Users can update own pricing profile"
  ON user_pricing_profiles FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users cannot delete pricing profiles" ON user_pricing_profiles;
CREATE POLICY "Users cannot delete pricing profiles"
  ON user_pricing_profiles FOR DELETE
  TO authenticated
  USING (false);


-- organizations table
DROP POLICY IF EXISTS "Users can view their own org" ON organizations;
CREATE POLICY "Users can view their own org"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org owners can update org" ON organizations;
CREATE POLICY "Org owners can update org"
  ON organizations FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT org_id FROM users 
      WHERE id = (SELECT auth.uid()) AND role = 'owner'
    )
  )
  WITH CHECK (
    id IN (
      SELECT org_id FROM users 
      WHERE id = (SELECT auth.uid()) AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "Org owners cannot delete org" ON organizations;
CREATE POLICY "Org owners cannot delete org"
  ON organizations FOR DELETE
  TO authenticated
  USING (false);


-- voice_intakes table
DROP POLICY IF EXISTS "Users can view own voice intakes" ON voice_intakes;
CREATE POLICY "Users can view own voice intakes"
  ON voice_intakes FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can create voice intakes" ON voice_intakes;
CREATE POLICY "Users can create voice intakes"
  ON voice_intakes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own voice intakes" ON voice_intakes;
CREATE POLICY "Users can update own voice intakes"
  ON voice_intakes FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own voice intakes" ON voice_intakes;
CREATE POLICY "Users can delete own voice intakes"
  ON voice_intakes FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- jobs table
DROP POLICY IF EXISTS "Users can view jobs" ON jobs;
CREATE POLICY "Users can view jobs"
  ON jobs FOR SELECT
  TO authenticated
  USING (
    (user_id = (SELECT auth.uid())) 
    OR ((is_public = true) AND (share_token IS NOT NULL))
  );

DROP POLICY IF EXISTS "Users can create their own jobs" ON jobs;
CREATE POLICY "Users can create their own jobs"
  ON jobs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own jobs" ON jobs;
CREATE POLICY "Users can update their own jobs"
  ON jobs FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own jobs" ON jobs;
CREATE POLICY "Users can delete their own jobs"
  ON jobs FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- All org-scoped tables (customers, quotes, line_items, etc.)
-- Pattern: org_id IN (SELECT org_id FROM users WHERE id = (SELECT auth.uid()))

-- customers
DROP POLICY IF EXISTS "Users can view org customers" ON customers;
CREATE POLICY "Users can view org customers"
  ON customers FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create org customers" ON customers;
CREATE POLICY "Users can create org customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update org customers" ON customers;
CREATE POLICY "Users can update org customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete org customers" ON customers;
CREATE POLICY "Users can delete org customers"
  ON customers FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );


-- customer_addresses
DROP POLICY IF EXISTS "Users can view org addresses" ON customer_addresses;
CREATE POLICY "Users can view org addresses"
  ON customer_addresses FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create org addresses" ON customer_addresses;
CREATE POLICY "Users can create org addresses"
  ON customer_addresses FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update org addresses" ON customer_addresses;
CREATE POLICY "Users can update org addresses"
  ON customer_addresses FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete org addresses" ON customer_addresses;
CREATE POLICY "Users can delete org addresses"
  ON customer_addresses FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );


-- quotes
DROP POLICY IF EXISTS "Users can view org quotes" ON quotes;
CREATE POLICY "Users can view org quotes"
  ON quotes FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create org quotes" ON quotes;
CREATE POLICY "Users can create org quotes"
  ON quotes FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update org quotes" ON quotes;
CREATE POLICY "Users can update org quotes"
  ON quotes FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete org quotes" ON quotes;
CREATE POLICY "Users can delete org quotes"
  ON quotes FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );


-- quote_line_items
DROP POLICY IF EXISTS "Users can view org quote line items" ON quote_line_items;
CREATE POLICY "Users can view org quote line items"
  ON quote_line_items FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create org quote line items" ON quote_line_items;
CREATE POLICY "Users can create org quote line items"
  ON quote_line_items FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update org quote line items" ON quote_line_items;
CREATE POLICY "Users can update org quote line items"
  ON quote_line_items FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete org quote line items" ON quote_line_items;
CREATE POLICY "Users can delete org quote line items"
  ON quote_line_items FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );


-- material_catalog_items
DROP POLICY IF EXISTS "Org members can view their catalog" ON material_catalog_items;
CREATE POLICY "Org members can view their catalog"
  ON material_catalog_items FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members can create catalog items" ON material_catalog_items;
CREATE POLICY "Org members can create catalog items"
  ON material_catalog_items FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members can update catalog items" ON material_catalog_items;
CREATE POLICY "Org members can update catalog items"
  ON material_catalog_items FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members can delete catalog items" ON material_catalog_items;
CREATE POLICY "Org members can delete catalog items"
  ON material_catalog_items FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );


-- invoices
DROP POLICY IF EXISTS "Users can view org invoices" ON invoices;
CREATE POLICY "Users can view org invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create org invoices" ON invoices;
CREATE POLICY "Users can create org invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update org invoices" ON invoices;
CREATE POLICY "Users can update org invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete org invoices" ON invoices;
CREATE POLICY "Users can delete org invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );


-- invoice_line_items
DROP POLICY IF EXISTS "Users can view org invoice line items" ON invoice_line_items;
CREATE POLICY "Users can view org invoice line items"
  ON invoice_line_items FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create org invoice line items" ON invoice_line_items;
CREATE POLICY "Users can create org invoice line items"
  ON invoice_line_items FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update org invoice line items" ON invoice_line_items;
CREATE POLICY "Users can update org invoice line items"
  ON invoice_line_items FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete org invoice line items" ON invoice_line_items;
CREATE POLICY "Users can delete org invoice line items"
  ON invoice_line_items FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );


-- qb_connections
DROP POLICY IF EXISTS "Org members can view connection" ON qb_connections;
CREATE POLICY "Org members can view connection"
  ON qb_connections FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org owners can create connection" ON qb_connections;
CREATE POLICY "Org owners can create connection"
  ON qb_connections FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users 
      WHERE id = (SELECT auth.uid()) AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "Org owners can update connection" ON qb_connections;
CREATE POLICY "Org owners can update connection"
  ON qb_connections FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users 
      WHERE id = (SELECT auth.uid()) AND role = 'owner'
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users 
      WHERE id = (SELECT auth.uid()) AND role = 'owner'
    )
  );


-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- This query should now return 0 rows (all policies optimized)
-- Run manually to verify:
-- SELECT tablename, policyname
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
--   AND qual NOT LIKE '%(SELECT auth.uid())%'
--   AND with_check NOT LIKE '%(SELECT auth.uid())%';

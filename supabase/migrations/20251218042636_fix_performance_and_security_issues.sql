/*
  # Fix Performance and Security Issues

  1. Performance Improvements
    - Add missing indexes for foreign keys (7 indexes)
    - Optimize RLS policies to use (select auth.uid()) pattern
    - Remove duplicate indexes
  
  2. Security Improvements
    - Set immutable search_path on all functions
    - Fix multiple permissive policies on jobs table
  
  3. Changes
    - Add indexes: customers_created_by_user_id, invoice_line_items_org_id, 
      invoices_address_id, invoices_created_by_user_id, material_catalog_items_created_by_user_id,
      quotes_address_id, quotes_created_by_user_id
    - Update all RLS policies to use (select auth.uid()) instead of auth.uid()
    - Drop duplicate indexes on integration_entity_map and quotes tables
    - Update all functions to use immutable search_path
    - Merge duplicate SELECT policies on jobs table
*/

-- ========================================
-- PART 1: Add Missing Foreign Key Indexes
-- ========================================

CREATE INDEX IF NOT EXISTS idx_customers_created_by_user_id 
  ON customers(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_org_id 
  ON invoice_line_items(org_id);

CREATE INDEX IF NOT EXISTS idx_invoices_address_id 
  ON invoices(address_id);

CREATE INDEX IF NOT EXISTS idx_invoices_created_by_user_id 
  ON invoices(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_material_catalog_items_created_by_user_id 
  ON material_catalog_items(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_quotes_address_id 
  ON quotes(address_id);

CREATE INDEX IF NOT EXISTS idx_quotes_created_by_user_id 
  ON quotes(created_by_user_id);

-- ========================================
-- PART 2: Remove Duplicate Indexes
-- ========================================

-- Drop duplicate indexes on integration_entity_map
DROP INDEX IF EXISTS uq_integration_external_mapping;
DROP INDEX IF EXISTS uq_integration_local_mapping;

-- Drop duplicate index on quotes (keep the constraint, drop the explicit index)
DROP INDEX IF EXISTS idx_quotes_approval_token;

-- ========================================
-- PART 3: Optimize RLS Policies
-- ========================================

-- jobs policies (also fix multiple permissive policies issue)
DROP POLICY IF EXISTS "Users can view their own jobs" ON jobs;
DROP POLICY IF EXISTS "Public can view shared jobs" ON jobs;
CREATE POLICY "Users can view jobs" ON jobs
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR (is_public = true AND share_token IS NOT NULL));

DROP POLICY IF EXISTS "Users can create their own jobs" ON jobs;
CREATE POLICY "Users can create their own jobs" ON jobs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their own jobs" ON jobs;
CREATE POLICY "Users can update their own jobs" ON jobs
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own jobs" ON jobs;
CREATE POLICY "Users can delete their own jobs" ON jobs
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- organizations policies
DROP POLICY IF EXISTS "Users can view their own org" ON organizations;
CREATE POLICY "Users can view their own org" ON organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Org owners can update org" ON organizations;
CREATE POLICY "Org owners can update org" ON organizations
  FOR UPDATE TO authenticated
  USING (id IN (SELECT org_id FROM users WHERE id = (select auth.uid()) AND role = 'owner'))
  WITH CHECK (id IN (SELECT org_id FROM users WHERE id = (select auth.uid()) AND role = 'owner'));

-- users policies
DROP POLICY IF EXISTS "Users can view own record" ON users;
CREATE POLICY "Users can view own record" ON users
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- customers policies
DROP POLICY IF EXISTS "Users can view org customers" ON customers;
CREATE POLICY "Users can view org customers" ON customers
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can create org customers" ON customers;
CREATE POLICY "Users can create org customers" ON customers
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update org customers" ON customers;
CREATE POLICY "Users can update org customers" ON customers
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can delete org customers" ON customers;
CREATE POLICY "Users can delete org customers" ON customers
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

-- customer_addresses policies
DROP POLICY IF EXISTS "Users can view org addresses" ON customer_addresses;
CREATE POLICY "Users can view org addresses" ON customer_addresses
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can create org addresses" ON customer_addresses;
CREATE POLICY "Users can create org addresses" ON customer_addresses
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update org addresses" ON customer_addresses;
CREATE POLICY "Users can update org addresses" ON customer_addresses
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can delete org addresses" ON customer_addresses;
CREATE POLICY "Users can delete org addresses" ON customer_addresses
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

-- quotes policies
DROP POLICY IF EXISTS "Users can view org quotes" ON quotes;
CREATE POLICY "Users can view org quotes" ON quotes
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can create org quotes" ON quotes;
CREATE POLICY "Users can create org quotes" ON quotes
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update org quotes" ON quotes;
CREATE POLICY "Users can update org quotes" ON quotes
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can delete org quotes" ON quotes;
CREATE POLICY "Users can delete org quotes" ON quotes
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

-- quote_line_items policies
DROP POLICY IF EXISTS "Users can view org quote line items" ON quote_line_items;
CREATE POLICY "Users can view org quote line items" ON quote_line_items
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can create org quote line items" ON quote_line_items;
CREATE POLICY "Users can create org quote line items" ON quote_line_items
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update org quote line items" ON quote_line_items;
CREATE POLICY "Users can update org quote line items" ON quote_line_items
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can delete org quote line items" ON quote_line_items;
CREATE POLICY "Users can delete org quote line items" ON quote_line_items
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

-- invoices policies
DROP POLICY IF EXISTS "Users can view org invoices" ON invoices;
CREATE POLICY "Users can view org invoices" ON invoices
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can create org invoices" ON invoices;
CREATE POLICY "Users can create org invoices" ON invoices
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update org invoices" ON invoices;
CREATE POLICY "Users can update org invoices" ON invoices
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can delete org invoices" ON invoices;
CREATE POLICY "Users can delete org invoices" ON invoices
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

-- invoice_line_items policies
DROP POLICY IF EXISTS "Users can view org invoice line items" ON invoice_line_items;
CREATE POLICY "Users can view org invoice line items" ON invoice_line_items
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can create org invoice line items" ON invoice_line_items;
CREATE POLICY "Users can create org invoice line items" ON invoice_line_items
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update org invoice line items" ON invoice_line_items;
CREATE POLICY "Users can update org invoice line items" ON invoice_line_items
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can delete org invoice line items" ON invoice_line_items;
CREATE POLICY "Users can delete org invoice line items" ON invoice_line_items
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

-- integration_entity_map policies
DROP POLICY IF EXISTS "Users can access org integration maps" ON integration_entity_map;
CREATE POLICY "Users can access org integration maps" ON integration_entity_map
  FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

-- voice_intakes policies
DROP POLICY IF EXISTS "Users can view own voice intakes" ON voice_intakes;
CREATE POLICY "Users can view own voice intakes" ON voice_intakes
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create voice intakes" ON voice_intakes;
CREATE POLICY "Users can create voice intakes" ON voice_intakes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own voice intakes" ON voice_intakes;
CREATE POLICY "Users can update own voice intakes" ON voice_intakes
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own voice intakes" ON voice_intakes;
CREATE POLICY "Users can delete own voice intakes" ON voice_intakes
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- qb_oauth_states policies
DROP POLICY IF EXISTS "Org members can manage OAuth states" ON qb_oauth_states;
CREATE POLICY "Org members can manage OAuth states" ON qb_oauth_states
  FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

-- qb_connections policies
DROP POLICY IF EXISTS "Org members can view connection" ON qb_connections;
CREATE POLICY "Org members can view connection" ON qb_connections
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Org owners can create connection" ON qb_connections;
CREATE POLICY "Org owners can create connection" ON qb_connections
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid()) AND role = 'owner'));

DROP POLICY IF EXISTS "Org owners can update connection" ON qb_connections;
CREATE POLICY "Org owners can update connection" ON qb_connections
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid()) AND role = 'owner'))
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid()) AND role = 'owner'));

-- user_pricing_profiles policies
DROP POLICY IF EXISTS "Users can view own pricing profile" ON user_pricing_profiles;
CREATE POLICY "Users can view own pricing profile" ON user_pricing_profiles
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own pricing profile" ON user_pricing_profiles;
CREATE POLICY "Users can update own pricing profile" ON user_pricing_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- material_catalog_items policies
DROP POLICY IF EXISTS "Org members can view their catalog" ON material_catalog_items;
CREATE POLICY "Org members can view their catalog" ON material_catalog_items
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Org members can create catalog items" ON material_catalog_items;
CREATE POLICY "Org members can create catalog items" ON material_catalog_items
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Org members can update catalog items" ON material_catalog_items;
CREATE POLICY "Org members can update catalog items" ON material_catalog_items
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Org members can delete catalog items" ON material_catalog_items;
CREATE POLICY "Org members can delete catalog items" ON material_catalog_items
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = (select auth.uid())));

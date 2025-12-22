/*
  # Fix Security Issues - Indexes and Policies

  ## Summary
  This migration addresses security and performance issues identified in the security audit:
  - Adds missing indexes for foreign key columns to improve query performance
  - Removes unused indexes that provide no benefit
  - Removes duplicate indexes
  - Consolidates duplicate permissive RLS policies

  ## Changes

  ### 1. Add Missing Foreign Key Indexes
  Adds indexes for 14 foreign key columns that were missing covering indexes:
    - `customer_addresses.org_id`
    - `customers.created_by_user_id`
    - `invoice_line_items.org_id`
    - `invoices.address_id`
    - `invoices.created_by_user_id`
    - `invoices.customer_id`
    - `material_catalog_items.created_by_user_id`
    - `qb_oauth_states.org_id`
    - `quote_line_items.catalog_item_id`
    - `quotes.address_id`
    - `quotes.created_by_user_id`
    - `user_pricing_profiles.org_id`
    - `voice_intakes.customer_id`
    - `voice_intakes.org_id`

  ### 2. Remove Unused Indexes
  Drops indexes that are not being used by any queries:
    - `idx_material_catalog_items_region_code`
    - `idx_material_catalog_items_region_is_core`

  ### 3. Remove Duplicate Index
  Removes duplicate index on material_catalog_items.org_id:
    - Keeps: `idx_material_catalog_items_org_id`
    - Drops: `idx_material_catalog_org_id`

  ### 4. Consolidate Duplicate RLS Policies
  Removes duplicate permissive policies on material_catalog_items:
    - Removes older/redundant policies
    - Keeps the more descriptive policy names

  ## Notes
  - All index operations use IF EXISTS/IF NOT EXISTS for safe execution
  - Foreign key indexes improve JOIN and WHERE clause performance
  - Removing unused indexes reduces storage overhead and write operation cost
  - Consolidated policies maintain the same security posture with less overhead
*/

-- ============================================================================
-- Add Missing Foreign Key Indexes
-- ============================================================================

-- customer_addresses
CREATE INDEX IF NOT EXISTS idx_customer_addresses_org_id 
  ON customer_addresses(org_id);

-- customers
CREATE INDEX IF NOT EXISTS idx_customers_created_by_user_id 
  ON customers(created_by_user_id);

-- invoice_line_items
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_org_id 
  ON invoice_line_items(org_id);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_address_id 
  ON invoices(address_id);

CREATE INDEX IF NOT EXISTS idx_invoices_created_by_user_id 
  ON invoices(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_id 
  ON invoices(customer_id);

-- material_catalog_items
CREATE INDEX IF NOT EXISTS idx_material_catalog_items_created_by_user_id 
  ON material_catalog_items(created_by_user_id);

-- qb_oauth_states
CREATE INDEX IF NOT EXISTS idx_qb_oauth_states_org_id 
  ON qb_oauth_states(org_id);

-- quote_line_items
CREATE INDEX IF NOT EXISTS idx_quote_line_items_catalog_item_id 
  ON quote_line_items(catalog_item_id);

-- quotes
CREATE INDEX IF NOT EXISTS idx_quotes_address_id 
  ON quotes(address_id);

CREATE INDEX IF NOT EXISTS idx_quotes_created_by_user_id 
  ON quotes(created_by_user_id);

-- user_pricing_profiles
CREATE INDEX IF NOT EXISTS idx_user_pricing_profiles_org_id 
  ON user_pricing_profiles(org_id);

-- voice_intakes
CREATE INDEX IF NOT EXISTS idx_voice_intakes_customer_id 
  ON voice_intakes(customer_id);

CREATE INDEX IF NOT EXISTS idx_voice_intakes_org_id 
  ON voice_intakes(org_id);

-- ============================================================================
-- Remove Unused Indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_material_catalog_items_region_code;
DROP INDEX IF EXISTS idx_material_catalog_items_region_is_core;

-- ============================================================================
-- Remove Duplicate Index
-- ============================================================================

-- Keep idx_material_catalog_items_org_id, drop the duplicate
DROP INDEX IF EXISTS idx_material_catalog_org_id;

-- ============================================================================
-- Consolidate Duplicate RLS Policies on material_catalog_items
-- ============================================================================

-- Remove older/redundant policies, keep the more descriptive ones

-- For SELECT: Keep the policy that allows viewing global guide + org catalog
-- (No duplicates reported for SELECT)

-- For INSERT: Remove "Users can insert to their org catalog"
DROP POLICY IF EXISTS "Users can insert to their org catalog" ON material_catalog_items;

-- For UPDATE: Remove "Users can update their org catalog"
DROP POLICY IF EXISTS "Users can update their org catalog" ON material_catalog_items;

-- For DELETE: Remove "Users can delete from their org catalog"
DROP POLICY IF EXISTS "Users can delete from their org catalog" ON material_catalog_items;
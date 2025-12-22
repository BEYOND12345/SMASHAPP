/*
  # Remove Unused Indexes

  1. Performance Improvement
    - Drop 14 unused indexes identified by security scan
    - Reduces write overhead on INSERT/UPDATE operations
    - Frees up storage space
    - Improves maintenance performance

  2. Indexes Being Removed
    - idx_customer_addresses_org_id - not used in queries
    - idx_customers_created_by_user_id - not used in queries
    - idx_invoice_line_items_org_id - not used in queries
    - idx_invoices_address_id - not used in queries
    - idx_invoices_created_by_user_id - not used in queries
    - idx_invoices_customer_id - not used in queries
    - idx_material_catalog_items_created_by_user_id - not used in queries
    - idx_qb_oauth_states_org_id - not used in queries
    - idx_quote_line_items_catalog_item_id - not used in queries
    - idx_quotes_address_id - not used in queries
    - idx_quotes_created_by_user_id - not used in queries
    - idx_user_pricing_profiles_org_id - not used in queries
    - idx_voice_intakes_customer_id - not used in queries
    - idx_voice_intakes_org_id - not used in queries

  3. Safety
    - All indexes are unused according to pg_stat_user_indexes
    - Other indexes remain for critical query paths
    - RLS policies and constraints unaffected
*/

-- Drop unused indexes (safe - not being used in any queries)
DROP INDEX IF EXISTS idx_customer_addresses_org_id;
DROP INDEX IF EXISTS idx_customers_created_by_user_id;
DROP INDEX IF EXISTS idx_invoice_line_items_org_id;
DROP INDEX IF EXISTS idx_invoices_address_id;
DROP INDEX IF EXISTS idx_invoices_created_by_user_id;
DROP INDEX IF EXISTS idx_invoices_customer_id;
DROP INDEX IF EXISTS idx_material_catalog_items_created_by_user_id;
DROP INDEX IF EXISTS idx_qb_oauth_states_org_id;
DROP INDEX IF EXISTS idx_quote_line_items_catalog_item_id;
DROP INDEX IF EXISTS idx_quotes_address_id;
DROP INDEX IF EXISTS idx_quotes_created_by_user_id;
DROP INDEX IF EXISTS idx_user_pricing_profiles_org_id;
DROP INDEX IF EXISTS idx_voice_intakes_customer_id;
DROP INDEX IF EXISTS idx_voice_intakes_org_id;
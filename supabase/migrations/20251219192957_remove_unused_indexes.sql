/*
  # Remove Unused Indexes

  1. Security Improvements
    - Remove 19 unused indexes to reduce maintenance overhead
    - Improves database performance by reducing index maintenance cost
    - Reduces storage usage
    - Eliminates unnecessary index update overhead on writes

  2. Indexes Removed
    - user_pricing_profiles_org_id_idx (unused coverage on org_id)
    - idx_invoices_customer (unused coverage on customer_id)
    - idx_customers_created_by_user_id (unused coverage)
    - idx_invoice_line_items_org_id (unused coverage)
    - idx_invoices_address_id (unused coverage)
    - idx_invoices_created_by_user_id (unused coverage)
    - voice_intakes_org_id_idx (unused coverage)
    - idx_customers_org_id (unused coverage)
    - idx_addresses_org (unused coverage)
    - idx_line_items_quote (unused coverage)
    - idx_quotes_address_id (unused coverage)
    - idx_quotes_created_by_user_id (unused coverage)
    - idx_voice_intakes_customer_id (unused coverage)
    - idx_integration_org_provider_status (unused coverage)
    - idx_material_catalog_items_created_by_user_id (unused coverage)
    - idx_quote_line_items_catalog_id (unused coverage)
    - idx_qb_oauth_states_org (unused coverage)
    - idx_qb_connections_org (unused coverage)

  3. Notes
    - Unused indexes waste resources on every INSERT/UPDATE/DELETE
    - Primary keys and unique constraints already provide necessary indexing
    - Additional indexes can be re-added later if query patterns show they're needed
*/

-- Remove unused indexes from user_pricing_profiles
DROP INDEX IF EXISTS user_pricing_profiles_org_id_idx;

-- Remove unused indexes from invoices
DROP INDEX IF EXISTS idx_invoices_customer;
DROP INDEX IF EXISTS idx_invoices_address_id;
DROP INDEX IF EXISTS idx_invoices_created_by_user_id;

-- Remove unused indexes from customers
DROP INDEX IF EXISTS idx_customers_created_by_user_id;
DROP INDEX IF EXISTS idx_customers_org_id;

-- Remove unused indexes from invoice_line_items
DROP INDEX IF EXISTS idx_invoice_line_items_org_id;

-- Remove unused indexes from voice_intakes
DROP INDEX IF EXISTS voice_intakes_org_id_idx;
DROP INDEX IF EXISTS idx_voice_intakes_customer_id;

-- Remove unused indexes from customer_addresses
DROP INDEX IF EXISTS idx_addresses_org;

-- Remove unused indexes from quote_line_items
DROP INDEX IF EXISTS idx_line_items_quote;
DROP INDEX IF EXISTS idx_quote_line_items_catalog_id;

-- Remove unused indexes from quotes
DROP INDEX IF EXISTS idx_quotes_address_id;
DROP INDEX IF EXISTS idx_quotes_created_by_user_id;

-- Remove unused indexes from integration_entity_map
DROP INDEX IF EXISTS idx_integration_org_provider_status;

-- Remove unused indexes from material_catalog_items
DROP INDEX IF EXISTS idx_material_catalog_items_created_by_user_id;

-- Remove unused indexes from QuickBooks tables
DROP INDEX IF EXISTS idx_qb_oauth_states_org;
DROP INDEX IF EXISTS idx_qb_connections_org;
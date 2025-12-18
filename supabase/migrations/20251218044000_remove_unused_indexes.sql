/*
  # Remove Unused Indexes

  1. Performance Improvements
    - Drop indexes that are genuinely unused and unlikely to be needed
    - Keep indexes that are performance-critical for common queries
  
  2. Indexes Dropped
    - idx_jobs_share_token (redundant with unique constraint)
    - idx_jobs_type (type filtering not common)
    - idx_jobs_created_at (date sorting not common for jobs)
    - idx_users_email (redundant with unique constraint)
    - idx_customers_email (email filtering not common)
    - idx_orgs_created_at (rarely sort orgs by date)
    - idx_material_catalog_name (pattern matching doesn't use index efficiently)
    - idx_material_catalog_category (category filtering not common)
    - idx_qb_oauth_states_expires (cleanup is infrequent enough)
    - voice_intakes_customer_id_idx (not commonly queried by customer)
  
  3. Indexes Kept (Performance Critical)
    - All org_id indexes (multi-tenant filtering)
    - All user_id indexes (user-specific queries)
    - All status indexes (filtering by status)
    - All foreign key indexes for joins
    - Integration map indexes (sync operations)
    - Quote and invoice relationship indexes
*/

-- Drop redundant indexes (unique constraints already provide index)
DROP INDEX IF EXISTS idx_jobs_share_token;
DROP INDEX IF EXISTS idx_users_email;

-- Drop indexes on columns rarely used in queries
DROP INDEX IF EXISTS idx_jobs_type;
DROP INDEX IF EXISTS idx_jobs_created_at;
DROP INDEX IF EXISTS idx_customers_email;
DROP INDEX IF EXISTS idx_orgs_created_at;

-- Drop indexes on text columns where pattern matching is more common than exact lookup
DROP INDEX IF EXISTS idx_material_catalog_name;
DROP INDEX IF EXISTS idx_material_catalog_category;

-- Drop indexes for infrequent operations
DROP INDEX IF EXISTS idx_qb_oauth_states_expires;
DROP INDEX IF EXISTS voice_intakes_customer_id_idx;

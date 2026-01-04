/*
  # Backfill Material Catalog Items with Org ID

  1. Problem
    - Scraped catalog items have org_id = NULL and region_code = 'AU' (global guide items)
    - RLS and app queries filter by org_id for org-specific items
    - Catalog matching cannot see global items, resulting in zero pricing
    - Voice-to-quote creates line items but with unit_price_cents = 0

  2. Solution
    - Convert global guide items to org-specific items
    - Set org_id to current production org
    - Clear region_code to NULL (required by dual_mode constraint)
    - Backfill created_by_user_id for ownership tracking
    - This makes catalog visible to app matching logic

  3. Constraint Requirement
    - material_catalog_items has CHECK constraint: dual_mode_chk
    - Rule: (org_id NOT NULL AND region_code NULL) OR (org_id NULL AND region_code NOT NULL)
    - Cannot have both org_id and region_code set
    - Converting from global (region='AU') to org-specific (org_id set)

  4. Important Notes
    - This is IDEMPOTENT: only updates rows where org_id IS NULL
    - Will not touch rows already assigned to an org
    - Safe to run multiple times
    - Current single-org production fix
    - For multi-tenant, future approach: separate system catalog or per-org copies
    - Region info lost but acceptable for single-org use case

  5. Target IDs
    - Org ID: 19c5198a-3066-4aa7-8062-5daf602e615b
    - User ID: 6d0be049-5fa8-4b30-98fa-44631ec0c9be
*/

-- Step A: Pre-check counts (for logging purposes)
DO $$
DECLARE
  v_null_count INT;
  v_org_count INT;
  v_global_au_count INT;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM material_catalog_items
  WHERE org_id IS NULL;

  SELECT COUNT(*) INTO v_org_count
  FROM material_catalog_items
  WHERE org_id = '19c5198a-3066-4aa7-8062-5daf602e615b';

  SELECT COUNT(*) INTO v_global_au_count
  FROM material_catalog_items
  WHERE org_id IS NULL AND region_code = 'AU';

  RAISE NOTICE '[CATALOG_BACKFILL] BEFORE: null_org_count=%, org_count=%, global_au_items=%', 
    v_null_count, v_org_count, v_global_au_count;
END $$;

-- Step B: Backfill org_id and clear region_code for unowned catalog items
-- This converts global guide items to org-specific items
UPDATE material_catalog_items
SET 
  org_id = '19c5198a-3066-4aa7-8062-5daf602e615b',
  region_code = NULL
WHERE org_id IS NULL;

-- Step C: Backfill created_by_user_id for items without creator
UPDATE material_catalog_items
SET created_by_user_id = '6d0be049-5fa8-4b30-98fa-44631ec0c9be'
WHERE created_by_user_id IS NULL;

-- Step D: Post-check counts (for verification)
DO $$
DECLARE
  v_null_count_after INT;
  v_org_count_after INT;
  v_global_au_count_after INT;
BEGIN
  SELECT COUNT(*) INTO v_null_count_after
  FROM material_catalog_items
  WHERE org_id IS NULL;

  SELECT COUNT(*) INTO v_org_count_after
  FROM material_catalog_items
  WHERE org_id = '19c5198a-3066-4aa7-8062-5daf602e615b';

  SELECT COUNT(*) INTO v_global_au_count_after
  FROM material_catalog_items
  WHERE org_id IS NULL AND region_code = 'AU';

  RAISE NOTICE '[CATALOG_BACKFILL] AFTER: null_org_count=%, org_count=%, global_au_items=%', 
    v_null_count_after, v_org_count_after, v_global_au_count_after;
  RAISE NOTICE '[CATALOG_BACKFILL] SUCCESS: Converted % global items to org-specific items', v_org_count_after;
END $$;

COMMENT ON TABLE material_catalog_items IS 'Material catalog with scraped data. Note: Global guide items converted to org-specific on 2026-01-05 for production org. Future: consider system catalog for multi-tenant.';

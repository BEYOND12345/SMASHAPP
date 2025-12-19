/*
  # Make org_id Nullable for Global Guide Items

  1. Changes
    - Remove NOT NULL constraint from material_catalog_items.org_id
    - This allows global guide items to have org_id = NULL
    - User catalog items will still have org_id populated

  2. Security
    - The dual_mode_chk constraint ensures either org_id OR region_code is set
    - RLS policies already handle both modes correctly

  IMPORTANT: This is required for the dual-mode catalog to work.
  Global guide items have org_id = NULL, region_code = 'AU' (or other countries).
  User catalog items have org_id set, region_code = NULL.
*/

BEGIN;

ALTER TABLE public.material_catalog_items
  ALTER COLUMN org_id DROP NOT NULL;

COMMIT;
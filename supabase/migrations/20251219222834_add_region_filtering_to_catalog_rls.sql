/*
  # Add Region Filtering to Material Catalog RLS

  1. Changes
    - Create helper function to get user's organization country
    - Update SELECT policy to filter global guide items by user's region
    - Users now only see guide items matching their org's country

  2. Behavior
    - AU org users see AU guide items (region_code='AU')
    - US org users see US guide items (region_code='US')
    - GB org users see GB guide items (region_code='GB')
    - Plus their own org-specific catalog items

  3. Notes
    - Uses organizations.country_code field (ISO codes: AU, US, GB, CA, etc.)
    - Existing org items (org_id NOT NULL) remain unaffected
    - Enables region-specific material databases
*/

BEGIN;

-- Helper function to get user's org country
CREATE OR REPLACE FUNCTION public.current_user_org_country()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.country_code
  FROM public.users u
  JOIN public.organizations o ON o.id = u.org_id
  WHERE u.id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_user_org_country() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_org_country() TO authenticated;

-- Update SELECT policy to filter by region
DROP POLICY IF EXISTS "Users can view org catalog and global guide" ON public.material_catalog_items;

CREATE POLICY "Users can view org catalog and regional guide"
  ON public.material_catalog_items
  FOR SELECT
  TO authenticated
  USING (
    -- User's org items
    (org_id IS NOT NULL AND user_belongs_to_org(org_id))
    OR
    -- Global guide items matching user's region
    (org_id IS NULL AND region_code = current_user_org_country())
  );

COMMIT;
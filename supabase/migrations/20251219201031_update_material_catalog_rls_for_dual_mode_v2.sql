/*
  # Update Material Catalog RLS for Dual Mode

  1. Changes
    - Create helper function to check org membership (fast, reusable)
    - Update SELECT policy: show user's org items + global guide items
    - Add restrictive policy: prevent modification of global guide items
    - Keep existing INSERT/UPDATE/DELETE policies for org-scoped items

  2. Security Model
    - Authenticated users can:
      - View their org's catalog items
      - View global guide items (org_id IS NULL, region_code IS NOT NULL)
      - Create/update/delete ONLY their org's items (org_id IS NOT NULL)
    - Global guide items:
      - Read-only for users
      - Modified only via migrations or service role

  3. Helper Function
    - `user_belongs_to_org(org_id uuid)` returns boolean
    - Checks if auth.uid() exists in users table with matching org_id
    - Used across multiple policies for consistency and performance
*/

BEGIN;

-- Helper function for org membership check
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(check_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND org_id = check_org_id
  );
$$;

-- Drop existing policies to replace them
DROP POLICY IF EXISTS "Org members can view their catalog" ON public.material_catalog_items;
DROP POLICY IF EXISTS "Org members can insert to their catalog" ON public.material_catalog_items;
DROP POLICY IF EXISTS "Org members can update their catalog" ON public.material_catalog_items;
DROP POLICY IF EXISTS "Org members can delete from their catalog" ON public.material_catalog_items;

-- New SELECT policy: org items + global guide
CREATE POLICY "Users can view org catalog and global guide"
  ON public.material_catalog_items
  FOR SELECT
  TO authenticated
  USING (
    -- User's org items
    (org_id IS NOT NULL AND user_belongs_to_org(org_id))
    OR
    -- Global guide items (org_id is null, region_code is set)
    (org_id IS NULL AND region_code IS NOT NULL)
  );

-- INSERT: org-scoped items only
CREATE POLICY "Users can insert to their org catalog"
  ON public.material_catalog_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND user_belongs_to_org(org_id)
    AND region_code IS NULL -- User items cannot set region_code
  );

-- UPDATE: org-scoped items only
CREATE POLICY "Users can update their org catalog"
  ON public.material_catalog_items
  FOR UPDATE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND user_belongs_to_org(org_id)
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND user_belongs_to_org(org_id)
    AND region_code IS NULL -- Cannot change to global guide item
  );

-- DELETE: org-scoped items only
CREATE POLICY "Users can delete from their org catalog"
  ON public.material_catalog_items
  FOR DELETE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND user_belongs_to_org(org_id)
  );

COMMIT;
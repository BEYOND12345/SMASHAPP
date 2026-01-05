/*
  # Create Material Catalog Aliases Table

  ## Purpose
  Deterministic alias mapping layer to fix generic material descriptions that fail to match catalog items.
  
  ## Problem Being Solved
  Generic phrases like "Decking materials" fail fuzzy matching and result in:
  - catalog_item_id = null
  - unit_price_cents = 0
  - needs_pricing = true
  
  This table enables deterministic matching before falling back to fuzzy matching.

  ## New Tables
  - `material_catalog_aliases`
    - `id` (uuid, primary key) - Unique identifier
    - `org_id` (uuid, not null) - Organization owning this alias
    - `canonical_catalog_item_id` (uuid, not null) - Target catalog item to map to
    - `alias_text` (text, not null) - Original human-readable alias
    - `normalized_alias` (text, not null) - Normalized version for matching
    - `priority` (int, default 100) - Lower number = higher priority when multiple matches
    - `created_at` (timestamptz) - Creation timestamp
    - `updated_at` (timestamptz) - Last update timestamp

  ## Constraints
  - Foreign key to organizations (cascade delete)
  - Foreign key to material_catalog_items (cascade delete)
  - Unique constraint on (org_id, normalized_alias) to prevent duplicates

  ## Indexes
  - Composite index on (org_id, normalized_alias) for fast lookups
  - Index on (org_id, canonical_catalog_item_id) for reverse lookups

  ## Security
  - RLS enabled
  - Users can only see/modify aliases for their own organization
  - Follows same org-scoping pattern as other tables
*/

-- Create the aliases table
CREATE TABLE IF NOT EXISTS material_catalog_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  canonical_catalog_item_id uuid NOT NULL REFERENCES material_catalog_items(id) ON DELETE CASCADE,
  alias_text text NOT NULL,
  normalized_alias text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add unique constraint to prevent duplicate normalized aliases per org
ALTER TABLE material_catalog_aliases
ADD CONSTRAINT material_catalog_aliases_org_normalized_unique
UNIQUE (org_id, normalized_alias);

-- Index for fast alias lookups (primary use case)
CREATE INDEX IF NOT EXISTS idx_material_catalog_aliases_org_normalized
ON material_catalog_aliases(org_id, normalized_alias);

-- Index for reverse lookups (finding all aliases for a catalog item)
CREATE INDEX IF NOT EXISTS idx_material_catalog_aliases_org_catalog_item
ON material_catalog_aliases(org_id, canonical_catalog_item_id);

-- Enable RLS
ALTER TABLE material_catalog_aliases ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view aliases for their organization
CREATE POLICY "Users can view own org aliases"
  ON material_catalog_aliases
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Users can insert aliases for their organization
CREATE POLICY "Users can insert own org aliases"
  ON material_catalog_aliases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Users can update aliases for their organization
CREATE POLICY "Users can update own org aliases"
  ON material_catalog_aliases
  FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Users can delete aliases for their organization
CREATE POLICY "Users can delete own org aliases"
  ON material_catalog_aliases
  FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_material_catalog_aliases_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_material_catalog_aliases_updated_at
  BEFORE UPDATE ON material_catalog_aliases
  FOR EACH ROW
  EXECUTE FUNCTION update_material_catalog_aliases_updated_at();

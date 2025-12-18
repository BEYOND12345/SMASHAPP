/*
  # Create Material Catalog Items Table

  1. New Tables
    - `material_catalog_items`
      - `id` (uuid, primary key)
      - `org_id` (uuid, foreign key to organizations)
      - `created_by_user_id` (uuid, foreign key to users)
      - `name` (text) - Material name/description
      - `category` (text) - e.g., "timber", "paint", "hardware", "fasteners", "other"
      - `unit` (text) - e.g., "each", "linear_m", "square_m", "litre"
      - `unit_price_cents` (bigint) - Price in cents
      - `supplier_name` (text, nullable) - Where you buy it
      - `sku_or_code` (text, nullable) - Product code
      - `notes` (text, nullable) - Additional notes
      - `is_active` (boolean) - For soft delete/archiving
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Org members can view their org's catalog
    - Org members can create/update/delete their org's catalog items
    
  3. Indexes
    - Index on org_id for fast lookups
    - Index on name for searching
    - Index on category for filtering
*/

-- Create material_catalog_items table
CREATE TABLE IF NOT EXISTS material_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  unit text NOT NULL,
  unit_price_cents bigint NOT NULL,
  supplier_name text,
  sku_or_code text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_material_category CHECK (category IN ('timber', 'paint', 'hardware', 'fasteners', 'electrical', 'plumbing', 'other')),
  CONSTRAINT check_material_price CHECK (unit_price_cents >= 0)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_material_catalog_org_id ON material_catalog_items(org_id);
CREATE INDEX IF NOT EXISTS idx_material_catalog_name ON material_catalog_items USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_material_catalog_category ON material_catalog_items(category);
CREATE INDEX IF NOT EXISTS idx_material_catalog_active ON material_catalog_items(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE material_catalog_items ENABLE ROW LEVEL SECURITY;

-- Policy: Org members can view their org's catalog
CREATE POLICY "Org members can view their catalog"
  ON material_catalog_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.org_id = material_catalog_items.org_id
      AND users.is_active = true
    )
  );

-- Policy: Org members can create catalog items
CREATE POLICY "Org members can create catalog items"
  ON material_catalog_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.org_id = material_catalog_items.org_id
      AND users.is_active = true
    )
  );

-- Policy: Org members can update their org's catalog
CREATE POLICY "Org members can update catalog items"
  ON material_catalog_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.org_id = material_catalog_items.org_id
      AND users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.org_id = material_catalog_items.org_id
      AND users.is_active = true
    )
  );

-- Policy: Org members can delete their org's catalog items
CREATE POLICY "Org members can delete catalog items"
  ON material_catalog_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.org_id = material_catalog_items.org_id
      AND users.is_active = true
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_material_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER material_catalog_updated_at
  BEFORE UPDATE ON material_catalog_items
  FOR EACH ROW
  EXECUTE FUNCTION update_material_catalog_updated_at();
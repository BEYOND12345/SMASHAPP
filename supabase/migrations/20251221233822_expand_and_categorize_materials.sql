/*
  # Expand Material Categories and Categorize Catalog

  1. Drops existing category constraint
  2. Adds new category values for better organization
  3. Updates all catalog items with proper categories
  
  New categories:
  - timber, paint, hardware, fasteners, electrical, plumbing (existing)
  - drywall, adhesives, building_materials, finishes, supplies (new)
*/

-- Drop existing constraint
ALTER TABLE material_catalog_items DROP CONSTRAINT IF EXISTS check_material_category;

-- Add expanded constraint with new categories
ALTER TABLE material_catalog_items ADD CONSTRAINT check_material_category 
  CHECK (category IN (
    'timber',
    'paint',
    'hardware',
    'fasteners',
    'electrical',
    'plumbing',
    'drywall',
    'adhesives',
    'building_materials',
    'finishes',
    'supplies',
    'other'
  ));

-- Update category based on category_group
UPDATE material_catalog_items
SET category = CASE
  -- Timber
  WHEN category_group = 'Timber' THEN 'timber'
  
  -- Fasteners (screws, nails, bolts)
  WHEN category_group = 'Hardware' THEN 'fasteners'
  
  -- Paint and related
  WHEN category_group IN ('Paint', 'Prep', 'Cleaning') THEN 'paint'
  
  -- Drywall and sheets
  WHEN category_group IN ('Plasterboard', 'Sheet') THEN 'drywall'
  
  -- Plumbing
  WHEN category_group IN ('Pipe', 'Fittings', 'Fixtures', 'Drainage') THEN 'plumbing'
  
  -- Electrical
  WHEN category_group IN ('Switches', 'Cable', 'Conduit', 'Lighting') THEN 'electrical'
  
  -- Building materials
  WHEN category_group IN ('Concrete', 'Masonry', 'Roofing', 'Aggregate', 'Insulation', 'Fencing') THEN 'building_materials'
  
  -- Finishes
  WHEN category_group IN ('Carpet', 'Vinyl', 'Laminate', 'Tile', 'Underlay', 'Pavers', 'Doors', 'Windows') THEN 'finishes'
  
  -- Adhesives
  WHEN category_group IN ('Adhesives', 'Silicone', 'Adhesive', 'Grout') THEN 'adhesives'
  
  -- Supplies
  WHEN category_group IN ('Supplies', 'Tape', 'Soil', 'Mulch', 'Sleepers') THEN 'supplies'
  
  ELSE 'other'
END
WHERE region_code = 'AU' AND org_id IS NULL;

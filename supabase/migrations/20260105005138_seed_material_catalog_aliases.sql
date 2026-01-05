/*
  # Seed Material Catalog Aliases

  ## Purpose
  Seed initial alias mappings for common generic phrases that fail fuzzy matching.

  ## Aliases Being Seeded

  ### Decking Aliases (pointing to "Merbau decking 90x19")
  - "decking materials" -> normalized: "decking"
  - "decking" -> normalized: "decking"
  - "deck boards" -> normalized: "deck boards"
  - "deck boards timber" -> normalized: "deck boards"
  - "deck timber" -> normalized: "deck"
  - "maroubra decking" -> normalized: "maroubra decking"
  - "deck material" -> normalized: "deck"
  - "deck" -> normalized: "deck"

  ### Plywood Aliases (pointing to "Particleboard chipboard 16mm")
  - "ply wood" -> normalized: "ply wood"
  - "plywood" -> normalized: "plywood"
  - "ply wood sheets" -> normalized: "ply wood"
  - "plywood sheets" -> normalized: "plywood"

  ## Priority Rules
  - More specific aliases get lower priority numbers (higher priority)
  - Generic aliases get higher priority numbers (lower priority)
  - This ensures "maroubra decking" matches before just "decking"

  ## Notes
  - Normalized values are calculated using the same normalizeText function in extract-quote-data
  - All aliases are org-specific (org_id: 19c5198a-3066-4aa7-8062-5daf602e615b)
  - Particleboard is used as a proxy for plywood until a proper plywood item is added
*/

-- Seed decking aliases
-- All point to "Merbau decking 90x19" (id: 3c0c8a47-4ec0-4cea-bda0-c034a59814cb)
INSERT INTO material_catalog_aliases (
  org_id,
  canonical_catalog_item_id,
  alias_text,
  normalized_alias,
  priority
) VALUES
  -- Most specific decking aliases (highest priority)
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '3c0c8a47-4ec0-4cea-bda0-c034a59814cb',
    'maroubra decking',
    'maroubra decking',
    10
  ),
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '3c0c8a47-4ec0-4cea-bda0-c034a59814cb',
    'deck boards timber',
    'deck boards',
    20
  ),
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '3c0c8a47-4ec0-4cea-bda0-c034a59814cb',
    'deck boards',
    'deck boards',
    30
  ),
  -- Medium specificity
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '3c0c8a47-4ec0-4cea-bda0-c034a59814cb',
    'decking materials',
    'decking',
    40
  ),
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '3c0c8a47-4ec0-4cea-bda0-c034a59814cb',
    'decking material',
    'decking',
    40
  ),
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '3c0c8a47-4ec0-4cea-bda0-c034a59814cb',
    'decking',
    'decking',
    50
  ),
  -- Generic aliases (lower priority)
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '3c0c8a47-4ec0-4cea-bda0-c034a59814cb',
    'deck timber',
    'deck',
    60
  ),
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '3c0c8a47-4ec0-4cea-bda0-c034a59814cb',
    'deck material',
    'deck',
    60
  ),
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '3c0c8a47-4ec0-4cea-bda0-c034a59814cb',
    'deck',
    'deck',
    70
  )
ON CONFLICT (org_id, normalized_alias) DO NOTHING;

-- Seed plywood aliases
-- Point to "Particleboard chipboard 16mm" (id: 386e268b-1b84-42a8-86a0-17081b7e4c72)
-- Note: This is a temporary mapping until a proper plywood item is added
INSERT INTO material_catalog_aliases (
  org_id,
  canonical_catalog_item_id,
  alias_text,
  normalized_alias,
  priority
) VALUES
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '386e268b-1b84-42a8-86a0-17081b7e4c72',
    'ply wood sheets',
    'ply wood',
    40
  ),
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '386e268b-1b84-42a8-86a0-17081b7e4c72',
    'plywood sheets',
    'plywood',
    40
  ),
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '386e268b-1b84-42a8-86a0-17081b7e4c72',
    'ply wood',
    'ply wood',
    50
  ),
  (
    '19c5198a-3066-4aa7-8062-5daf602e615b',
    '386e268b-1b84-42a8-86a0-17081b7e4c72',
    'plywood',
    'plywood',
    50
  )
ON CONFLICT (org_id, normalized_alias) DO NOTHING;

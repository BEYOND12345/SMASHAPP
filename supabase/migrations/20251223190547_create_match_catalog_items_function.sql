/*
  # Create catalog matching SQL function for Phase 1.2

  1. New Functions
    - `match_catalog_items_for_quote_materials`
      - Fuzzy matches material descriptions to catalog items
      - Returns catalog_item_id, match_confidence, and pricing data
      - Uses ILIKE and pg_trgm similarity when available
      - Filters by org_id and region_code

  2. Purpose
    - Move catalog matching from OpenAI to deterministic SQL
    - Reduce OpenAI reasoning load and tokens
    - Enable faster, more predictable catalog matching

  3. Match Strategy
    - Exact name match: confidence 1.0
    - Alias contains match: confidence 0.8
    - Category/category_group match: confidence 0.6
    - Fuzzy similarity with pg_trgm if enabled: variable confidence
    - No match: returns null values
*/

CREATE OR REPLACE FUNCTION public.match_catalog_items_for_quote_materials(
  p_org_id uuid,
  p_region_code text,
  p_materials jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_material jsonb;
  v_result jsonb := '[]'::jsonb;
  v_match_result jsonb;
  v_description text;
  v_unit text;
  v_best_match record;
  v_has_trgm boolean;
BEGIN
  -- Check if pg_trgm extension is available
  SELECT EXISTS(
    SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
  ) INTO v_has_trgm;

  -- Iterate through each material
  FOR v_material IN SELECT * FROM jsonb_array_elements(p_materials)
  LOOP
    v_description := LOWER(COALESCE(v_material->>'description', ''));
    v_unit := LOWER(COALESCE(v_material->>'unit', ''));
    v_best_match := NULL;

    -- Skip empty descriptions
    IF v_description = '' THEN
      v_match_result := jsonb_build_object(
        'catalog_item_id', null,
        'match_confidence', null,
        'unit', null,
        'typical_low_price_cents', null,
        'typical_high_price_cents', null
      );
      v_result := v_result || v_match_result;
      CONTINUE;
    END IF;

    -- Try exact name match first
    SELECT
      id,
      name,
      unit,
      typical_low_price_cents,
      typical_high_price_cents,
      1.0 as confidence
    INTO v_best_match
    FROM material_catalog_items
    WHERE is_active = true
      AND (org_id = p_org_id OR (org_id IS NULL AND region_code = p_region_code))
      AND LOWER(name) = v_description
    LIMIT 1;

    -- If no exact match, try name contains match
    IF v_best_match IS NULL THEN
      SELECT
        id,
        name,
        unit,
        typical_low_price_cents,
        typical_high_price_cents,
        1.0 as confidence
      INTO v_best_match
      FROM material_catalog_items
      WHERE is_active = true
        AND (org_id = p_org_id OR (org_id IS NULL AND region_code = p_region_code))
        AND LOWER(name) LIKE '%' || v_description || '%'
      LIMIT 1;
    END IF;

    -- If still no match, try reverse: description contains name
    IF v_best_match IS NULL THEN
      SELECT
        id,
        name,
        unit,
        typical_low_price_cents,
        typical_high_price_cents,
        0.9 as confidence
      INTO v_best_match
      FROM material_catalog_items
      WHERE is_active = true
        AND (org_id = p_org_id OR (org_id IS NULL AND region_code = p_region_code))
        AND v_description LIKE '%' || LOWER(name) || '%'
      ORDER BY LENGTH(name) DESC
      LIMIT 1;
    END IF;

    -- Try search_aliases match
    IF v_best_match IS NULL THEN
      SELECT
        id,
        name,
        unit,
        typical_low_price_cents,
        typical_high_price_cents,
        0.8 as confidence
      INTO v_best_match
      FROM material_catalog_items
      WHERE is_active = true
        AND (org_id = p_org_id OR (org_id IS NULL AND region_code = p_region_code))
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(search_aliases) alias
          WHERE v_description LIKE '%' || LOWER(alias) || '%'
        )
      LIMIT 1;
    END IF;

    -- Try category match
    IF v_best_match IS NULL THEN
      SELECT
        id,
        name,
        unit,
        typical_low_price_cents,
        typical_high_price_cents,
        0.6 as confidence
      INTO v_best_match
      FROM material_catalog_items
      WHERE is_active = true
        AND (org_id = p_org_id OR (org_id IS NULL AND region_code = p_region_code))
        AND (
          LOWER(category) LIKE '%' || v_description || '%'
          OR v_description LIKE '%' || LOWER(category) || '%'
          OR LOWER(category_group) LIKE '%' || v_description || '%'
          OR v_description LIKE '%' || LOWER(category_group) || '%'
        )
      LIMIT 1;
    END IF;

    -- Try fuzzy matching with pg_trgm if available and no match yet
    IF v_best_match IS NULL AND v_has_trgm THEN
      EXECUTE format(
        'SELECT
          id,
          name,
          unit,
          typical_low_price_cents,
          typical_high_price_cents,
          GREATEST(
            similarity(LOWER(name), %L),
            (SELECT MAX(similarity(LOWER(alias), %L))
             FROM jsonb_array_elements_text(search_aliases) alias)
          ) as confidence
        FROM material_catalog_items
        WHERE is_active = true
          AND (org_id = %L OR (org_id IS NULL AND region_code = %L))
          AND (
            similarity(LOWER(name), %L) > 0.3
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(search_aliases) alias
              WHERE similarity(LOWER(alias), %L) > 0.3
            )
          )
        ORDER BY confidence DESC
        LIMIT 1',
        v_description, v_description, p_org_id, p_region_code,
        v_description, v_description
      ) INTO v_best_match;
    END IF;

    -- Build result for this material
    IF v_best_match IS NOT NULL THEN
      v_match_result := jsonb_build_object(
        'catalog_item_id', v_best_match.id,
        'match_confidence', v_best_match.confidence,
        'unit', v_best_match.unit,
        'typical_low_price_cents', v_best_match.typical_low_price_cents,
        'typical_high_price_cents', v_best_match.typical_high_price_cents
      );
    ELSE
      v_match_result := jsonb_build_object(
        'catalog_item_id', null,
        'match_confidence', null,
        'unit', null,
        'typical_low_price_cents', null,
        'typical_high_price_cents', null
      );
    END IF;

    v_result := v_result || v_match_result;
  END LOOP;

  RETURN v_result;
END;
$$;
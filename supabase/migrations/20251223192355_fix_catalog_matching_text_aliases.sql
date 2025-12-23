/*
  # Fix catalog matching function for TEXT search_aliases

  1. Problem
    - search_aliases column is TEXT type (comma-separated values)
    - Function was treating it as JSONB causing all matches to fail
    - Materials show $0.00 because catalog matching returns no results

  2. Solution
    - Update function to parse TEXT aliases correctly
    - Use string_to_array and unnest to split comma-separated values
    - Maintain same matching confidence levels
    
  3. Impact
    - Materials will now match catalog items correctly
    - Pricing will populate automatically for matched items
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
  SELECT EXISTS(
    SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
  ) INTO v_has_trgm;

  FOR v_material IN SELECT * FROM jsonb_array_elements(p_materials)
  LOOP
    v_description := LOWER(COALESCE(v_material->>'description', ''));
    v_unit := LOWER(COALESCE(v_material->>'unit', ''));
    v_best_match := NULL;

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

    IF v_best_match IS NULL AND EXISTS (
      SELECT 1 FROM material_catalog_items 
      WHERE is_active = true 
        AND search_aliases IS NOT NULL 
        AND search_aliases != ''
    ) THEN
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
        AND search_aliases IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM unnest(string_to_array(search_aliases, ',')) AS alias
          WHERE v_description LIKE '%' || LOWER(TRIM(alias)) || '%'
             OR LOWER(TRIM(alias)) LIKE '%' || v_description || '%'
        )
      LIMIT 1;
    END IF;

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
            COALESCE((
              SELECT MAX(similarity(LOWER(TRIM(alias)), %L))
              FROM unnest(string_to_array(search_aliases, '','')) alias
              WHERE search_aliases IS NOT NULL
            ), 0)
          ) as confidence
        FROM material_catalog_items
        WHERE is_active = true
          AND (org_id = %L OR (org_id IS NULL AND region_code = %L))
          AND (
            similarity(LOWER(name), %L) > 0.3
            OR (
              search_aliases IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM unnest(string_to_array(search_aliases, '','')) alias
                WHERE similarity(LOWER(TRIM(alias)), %L) > 0.3
              )
            )
          )
        ORDER BY confidence DESC
        LIMIT 1',
        v_description, v_description, p_org_id, p_region_code,
        v_description, v_description
      ) INTO v_best_match;
    END IF;

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

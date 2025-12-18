/*
  # Security and Integrity Enforcement Patches

  ## Critical Fixes
  
  ### Patch 1: Fix Public Quote Access Leak
  - **CRITICAL**: Removed direct public access to quotes table
  - Public can only access quotes via secure functions with valid token
  - Prevents unauthorized viewing of all public quotes
  
  ### Patch 2: Bootstrap Onboarding
  - Added `create_org_and_membership()` function
  - Creates organization and user membership atomically
  - Called after signup to establish initial org
  
  ### Patch 3: Totals Enforcement
  - Totals are now derived and cannot be edited manually
  - Automatic recalculation after any line item change
  - Row-level locking prevents race conditions
  - Supports both tax-inclusive and tax-exclusive calculations
  
  ### Patch 4: Quote Acceptance Immutability
  - Accepted quotes cannot be modified
  - Acceptance cannot be overwritten
  - Snapshot captured at acceptance time
  - Line items locked after acceptance
  
  ### Patch 5: Status State Machine
  - Enforces valid status transitions
  - Automatically sets timestamps
  - Requires acceptance metadata
  - Prevents transitions from end states
  
  ### Patch 6: Relationship Integrity
  - Enforces quote org_id matches customer org_id
  - Validates address belongs to customer and org
  - Line items must match quote org_id
  
  ### Patch 7: Line Item Ordering
  - Unique position per quote
  - Prevents duplicate positions
  
  ### Patch 8: Integration Readiness
  - Added `integration_entity_map` table
  - Maps local entities to QuickBooks/Xero
  - Tracks sync status and errors
  - Clean design without polluting core tables
  
  ## Security Impact
  - Closes critical public quote exposure vulnerability
  - Prevents financial fraud via manual total manipulation
  - Ensures accepted quotes are immutable legal documents
  - Maintains referential integrity across org boundaries
*/

-- ============================================================================
-- PATCH 1: FIX PUBLIC ACCESS LEAK
-- ============================================================================

DROP POLICY IF EXISTS "Public can view quotes with valid token" ON quotes;
DROP POLICY IF EXISTS "Public can view line items for public quotes" ON quote_line_items;

REVOKE ALL ON quotes FROM public;
REVOKE ALL ON quote_line_items FROM public;

CREATE OR REPLACE FUNCTION get_public_quote(p_token uuid)
RETURNS SETOF public_quote_view
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT *
  FROM public_quote_view
  WHERE approval_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_public_quote(uuid) TO public;

CREATE OR REPLACE FUNCTION get_public_quote_line_items(p_token uuid)
RETURNS SETOF quote_line_items
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT li.*
  FROM quote_line_items li
  JOIN quotes q ON q.id = li.quote_id
  WHERE q.is_public = true
    AND q.approval_token = p_token
  ORDER BY li.position ASC, li.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION get_public_quote_line_items(uuid) TO public;

-- ============================================================================
-- PATCH 2: BOOTSTRAP ONBOARDING
-- ============================================================================

DROP POLICY IF EXISTS "Users can create orgs" ON organizations;
DROP POLICY IF EXISTS "Users can insert users row" ON users;

CREATE OR REPLACE FUNCTION create_org_and_membership(
  p_org_name text,
  p_trade_type text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_default_currency text DEFAULT 'AUD',
  p_default_tax_rate numeric DEFAULT 10.00
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid;
  v_org_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Membership already exists';
  END IF;

  INSERT INTO organizations (
    name, trade_type, phone, email, default_currency, default_tax_rate
  )
  VALUES (
    p_org_name, p_trade_type, p_phone, p_email, p_default_currency, p_default_tax_rate
  )
  RETURNING id INTO v_org_id;

  INSERT INTO users (id, org_id, email, full_name, role)
  VALUES (
    v_uid,
    v_org_id,
    COALESCE(p_email, (SELECT email FROM auth.users WHERE id = v_uid)),
    NULL,
    'owner'
  );

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_org_and_membership(text,text,text,text,text,numeric) TO authenticated;

-- ============================================================================
-- PATCH 3: ENFORCE TOTALS AND PREVENT FRAUD
-- ============================================================================

CREATE OR REPLACE FUNCTION quote_totals_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('quote_totals.recalc', true) IS DISTINCT FROM 'on' THEN
    IF NEW.labour_subtotal_cents IS DISTINCT FROM OLD.labour_subtotal_cents
      OR NEW.materials_subtotal_cents IS DISTINCT FROM OLD.materials_subtotal_cents
      OR NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
      OR NEW.tax_total_cents IS DISTINCT FROM OLD.tax_total_cents
      OR NEW.grand_total_cents IS DISTINCT FROM OLD.grand_total_cents THEN
      RAISE EXCEPTION 'Totals are derived and cannot be edited directly';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_totals_guard ON quotes;
CREATE TRIGGER trg_quote_totals_guard
BEFORE UPDATE ON quotes
FOR EACH ROW
EXECUTE FUNCTION quote_totals_guard();

CREATE OR REPLACE FUNCTION recalculate_quote_totals(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_labour_total bigint;
  v_materials_total bigint;
  v_subtotal bigint;
  v_tax_rate numeric;
  v_tax_total bigint;
  v_grand_total bigint;
  v_tax_inclusive boolean;
BEGIN
  PERFORM 1 FROM quotes WHERE id = p_quote_id FOR UPDATE;

  SELECT default_tax_rate, tax_inclusive
  INTO v_tax_rate, v_tax_inclusive
  FROM quotes
  WHERE id = p_quote_id;

  SELECT
    COALESCE(SUM(CASE WHEN item_type = 'labour' THEN line_total_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type != 'labour' THEN line_total_cents ELSE 0 END), 0),
    COALESCE(SUM(line_total_cents), 0)
  INTO v_labour_total, v_materials_total, v_subtotal
  FROM quote_line_items
  WHERE quote_id = p_quote_id;

  IF v_tax_inclusive THEN
    v_tax_total := ROUND(v_subtotal * v_tax_rate / (100 + v_tax_rate));
    v_grand_total := v_subtotal;
  ELSE
    v_tax_total := ROUND(v_subtotal * v_tax_rate / 100);
    v_grand_total := v_subtotal + v_tax_total;
  END IF;

  PERFORM set_config('quote_totals.recalc', 'on', true);

  UPDATE quotes
  SET
    labour_subtotal_cents = v_labour_total,
    materials_subtotal_cents = v_materials_total,
    subtotal_cents = v_subtotal,
    tax_total_cents = v_tax_total,
    grand_total_cents = v_grand_total,
    updated_at = now()
  WHERE id = p_quote_id;

  PERFORM set_config('quote_totals.recalc', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION quote_line_items_recalc_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_quote_id uuid;
BEGIN
  v_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);
  PERFORM recalculate_quote_totals(v_quote_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_line_items_recalc ON quote_line_items;
CREATE TRIGGER trg_quote_line_items_recalc
AFTER INSERT OR UPDATE OR DELETE ON quote_line_items
FOR EACH ROW
EXECUTE FUNCTION quote_line_items_recalc_trigger();

-- ============================================================================
-- PATCH 4: MAKE ACCEPTANCE IDEMPOTENT AND LOCK QUOTES
-- ============================================================================

ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS accepted_quote_snapshot jsonb;

CREATE OR REPLACE FUNCTION prevent_mutations_after_acceptance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('accepted', 'invoiced') THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (OLD.status = 'accepted' AND NEW.status = 'invoiced') THEN
        RAISE EXCEPTION 'Status transition not allowed after acceptance';
      END IF;
    END IF;

    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.address_id IS DISTINCT FROM OLD.address_id
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.default_tax_rate IS DISTINCT FROM OLD.default_tax_rate
      OR NEW.tax_inclusive IS DISTINCT FROM OLD.tax_inclusive
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.terms_and_conditions IS DISTINCT FROM OLD.terms_and_conditions THEN
      RAISE EXCEPTION 'Accepted quotes are immutable';
    END IF;
  END IF;

  IF OLD.accepted_at IS NOT NULL THEN
    IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
      OR NEW.accepted_by_name IS DISTINCT FROM OLD.accepted_by_name
      OR NEW.accepted_by_email IS DISTINCT FROM OLD.accepted_by_email
      OR NEW.accepted_by_ip IS DISTINCT FROM OLD.accepted_by_ip
      OR NEW.signature_data_url IS DISTINCT FROM OLD.signature_data_url THEN
      RAISE EXCEPTION 'Acceptance is already recorded and cannot be overwritten';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_mutations_after_acceptance ON quotes;
CREATE TRIGGER trg_prevent_mutations_after_acceptance
BEFORE UPDATE ON quotes
FOR EACH ROW
EXECUTE FUNCTION prevent_mutations_after_acceptance();

CREATE OR REPLACE FUNCTION prevent_line_item_mutations_if_locked()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM quotes
  WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);

  IF v_status IN ('accepted', 'invoiced') THEN
    RAISE EXCEPTION 'Line items cannot be modified after acceptance';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_line_item_mutations_if_locked ON quote_line_items;
CREATE TRIGGER trg_prevent_line_item_mutations_if_locked
BEFORE INSERT OR UPDATE OR DELETE ON quote_line_items
FOR EACH ROW
EXECUTE FUNCTION prevent_line_item_mutations_if_locked();

CREATE OR REPLACE FUNCTION capture_acceptance_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    NEW.accepted_quote_snapshot :=
      jsonb_build_object(
        'quote', to_jsonb(NEW),
        'line_items', (
          SELECT jsonb_agg(to_jsonb(li) ORDER BY li.position ASC, li.created_at ASC)
          FROM quote_line_items li
          WHERE li.quote_id = NEW.id
        )
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_acceptance_snapshot ON quotes;
CREATE TRIGGER trg_capture_acceptance_snapshot
BEFORE UPDATE ON quotes
FOR EACH ROW
EXECUTE FUNCTION capture_acceptance_snapshot();

-- ============================================================================
-- PATCH 5: ENFORCE STATUS TRANSITIONS AS STATE MACHINE
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_quote_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'draft' AND NEW.status NOT IN ('sent', 'expired') THEN
      RAISE EXCEPTION 'Invalid status transition';
    END IF;

    IF OLD.status = 'sent' AND NEW.status NOT IN ('accepted', 'declined', 'expired') THEN
      RAISE EXCEPTION 'Invalid status transition';
    END IF;

    IF OLD.status = 'accepted' AND NEW.status NOT IN ('invoiced') THEN
      RAISE EXCEPTION 'Invalid status transition';
    END IF;

    IF OLD.status IN ('declined', 'expired', 'invoiced') THEN
      RAISE EXCEPTION 'End state cannot transition';
    END IF;

    IF NEW.status = 'sent' AND NEW.sent_at IS NULL THEN
      NEW.sent_at := now();
    END IF;

    IF NEW.status = 'accepted' AND NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;

    IF NEW.status = 'accepted' AND NEW.accepted_by_email IS NULL THEN
      RAISE EXCEPTION 'accepted_by_email required';
    END IF;

    IF NEW.status = 'declined' AND NEW.declined_at IS NULL THEN
      NEW.declined_at := now();
    END IF;

    IF NEW.status = 'expired' AND NEW.expires_at IS NULL THEN
      NEW.expires_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_quote_status_transitions ON quotes;
CREATE TRIGGER trg_enforce_quote_status_transitions
BEFORE UPDATE OF status ON quotes
FOR EACH ROW
EXECUTE FUNCTION enforce_quote_status_transitions();

-- ============================================================================
-- PATCH 6: ADDRESS AND ORG CONSISTENCY ENFORCEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_quote_relationship_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_org uuid;
  v_address_customer uuid;
  v_address_org uuid;
BEGIN
  SELECT org_id INTO v_customer_org FROM customers WHERE id = NEW.customer_id;
  IF v_customer_org IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF NEW.org_id <> v_customer_org THEN
    RAISE EXCEPTION 'Quote org_id must match customer org_id';
  END IF;

  IF NEW.address_id IS NOT NULL THEN
    SELECT customer_id, org_id INTO v_address_customer, v_address_org
    FROM customer_addresses
    WHERE id = NEW.address_id;

    IF v_address_customer IS NULL THEN
      RAISE EXCEPTION 'Address not found';
    END IF;

    IF v_address_customer <> NEW.customer_id THEN
      RAISE EXCEPTION 'Address must belong to the selected customer';
    END IF;

    IF v_address_org <> NEW.org_id THEN
      RAISE EXCEPTION 'Address org_id must match quote org_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_quote_relationship_integrity ON quotes;
CREATE TRIGGER trg_enforce_quote_relationship_integrity
BEFORE INSERT OR UPDATE ON quotes
FOR EACH ROW
EXECUTE FUNCTION enforce_quote_relationship_integrity();

CREATE OR REPLACE FUNCTION enforce_line_item_org_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_quote_org uuid;
BEGIN
  SELECT org_id INTO v_quote_org FROM quotes WHERE id = NEW.quote_id;
  IF v_quote_org IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF NEW.org_id <> v_quote_org THEN
    RAISE EXCEPTION 'Line item org_id must match quote org_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_line_item_org_consistency ON quote_line_items;
CREATE TRIGGER trg_enforce_line_item_org_consistency
BEFORE INSERT OR UPDATE ON quote_line_items
FOR EACH ROW
EXECUTE FUNCTION enforce_line_item_org_consistency();

-- ============================================================================
-- PATCH 7: LINE ITEM ORDERING CORRECTNESS
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_line_items_position
ON quote_line_items(quote_id, position);

-- ============================================================================
-- PATCH 8: INTEGRATION READINESS
-- ============================================================================

CREATE TABLE IF NOT EXISTS integration_entity_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  entity_type text NOT NULL,
  local_id uuid NOT NULL,
  external_id text NOT NULL,
  external_sync_token text,
  sync_status text NOT NULL DEFAULT 'pending',
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_provider CHECK (provider IN ('quickbooks', 'xero')),
  CONSTRAINT check_entity_type CHECK (entity_type IN ('customer', 'quote', 'invoice')),
  CONSTRAINT check_sync_status CHECK (sync_status IN ('pending', 'synced', 'error'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_map_local
ON integration_entity_map(org_id, provider, entity_type, local_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_map_external
ON integration_entity_map(org_id, provider, entity_type, external_id);

ALTER TABLE integration_entity_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access org integration maps" ON integration_entity_map;
CREATE POLICY "Users can access org integration maps"
ON integration_entity_map FOR ALL
TO authenticated
USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()))
WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));
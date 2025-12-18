/*
  # Accounting Sync Readiness and Sync Locking

  ## Overview
  Prepare invoices and customers for safe, idempotent sync with QuickBooks and Xero.
  Once synced, documents become financial records and are locked from changes that
  would desync accounting systems.

  ## 1. Integration Mapping Table Updates
  
  ### `integration_entity_map` (already exists, adding missing columns and constraints)
  - Renamed columns:
    - `external_sync_token` → `sync_token`
    - `last_error` → `sync_error`
    - `last_synced_at` → `synced_at`
  - Added column:
    - `last_sync_attempt_at` (timestamptz)
  - Constraints:
    - `provider` must be 'quickbooks' or 'xero'
    - `entity_type` must be 'customer' or 'invoice' (removed 'quote' for accounting sync)
    - `sync_status` must be 'pending', 'synced', or 'error'
  - Unique constraints:
    - unique(org_id, provider, entity_type, local_id) - one mapping per entity per provider
    - unique(org_id, provider, entity_type, external_id) - one external ID per entity per provider
  - Indexes for performance

  ## 2. Sync Status State Machine
  
  Enforces valid transitions with trigger:
  - pending → synced (successful sync)
  - pending → error (sync failed)
  - error → pending (retry)
  - synced → pending (re-sync allowed)
  
  Disallowed:
  - synced → error (must go through pending)
  - error → synced (must go through pending)
  
  Rules:
  - Moving to synced: auto-set synced_at if null
  - Moving to error: sync_error must be non-empty
  - Moving to pending: sync_error must be cleared

  ## 3. Synced Invoice Locking
  
  Once invoice is synced (sync_status = 'synced'), protect accounting integrity:
  
  ### Blocked updates on invoices table:
  - customer_id
  - address_id
  - currency
  - tax_inclusive
  - default_tax_rate (renamed from tax_rate)
  - labour_subtotal_cents
  - materials_subtotal_cents
  - subtotal_cents
  - tax_total_cents
  - grand_total_cents
  - invoice_number
  - invoice_date
  - due_date
  - invoice_snapshot
  
  ### Blocked operations on invoice_line_items:
  - INSERT (cannot add line items)
  - UPDATE (cannot modify line items)
  - DELETE (cannot remove line items)
  
  ### Allowed while synced:
  - amount_paid_cents (payment tracking)
  - paid_at (payment tracking)
  - status transitions: draft/issued/sent → overdue/paid/void
    - Only if they don't change totals
    - Enforced by existing status machine trigger

  ## 4. Synced Customer Protection
  
  Once customer is synced (sync_status = 'synced'):
  - BLOCKED: deletion (prevents breaking FK references in accounting system)
  - BLOCKED: org_id changes (always blocked, prevents moving between orgs)
  - ALLOWED: name, email, phone, notes (contact info updates)
  
  ## 5. Security
  - RLS enabled on integration_entity_map
  - Only org members can read/write their mappings
  - No public access
*/

-- ============================================================================
-- MODIFY INTEGRATION_ENTITY_MAP TABLE
-- ============================================================================

-- Add missing column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integration_entity_map' AND column_name = 'last_sync_attempt_at'
  ) THEN
    ALTER TABLE integration_entity_map ADD COLUMN last_sync_attempt_at timestamptz;
  END IF;
END $$;

-- Rename columns if they exist with old names
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integration_entity_map' AND column_name = 'external_sync_token'
  ) THEN
    ALTER TABLE integration_entity_map RENAME COLUMN external_sync_token TO sync_token;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integration_entity_map' AND column_name = 'last_error'
  ) THEN
    ALTER TABLE integration_entity_map RENAME COLUMN last_error TO sync_error;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integration_entity_map' AND column_name = 'last_synced_at'
  ) THEN
    ALTER TABLE integration_entity_map RENAME COLUMN last_synced_at TO synced_at;
  END IF;
END $$;

-- Update entity_type constraint (remove 'quote', keep only customer and invoice)
ALTER TABLE integration_entity_map DROP CONSTRAINT IF EXISTS integration_entity_map_entity_type_check;
ALTER TABLE integration_entity_map ADD CONSTRAINT integration_entity_map_entity_type_check
CHECK (entity_type IN ('customer', 'invoice'));

-- Ensure provider constraint is correct
ALTER TABLE integration_entity_map DROP CONSTRAINT IF EXISTS integration_entity_map_provider_check;
ALTER TABLE integration_entity_map ADD CONSTRAINT integration_entity_map_provider_check
CHECK (provider IN ('quickbooks', 'xero'));

-- Ensure sync_status constraint is correct
ALTER TABLE integration_entity_map DROP CONSTRAINT IF EXISTS integration_entity_map_sync_status_check;
ALTER TABLE integration_entity_map ADD CONSTRAINT integration_entity_map_sync_status_check
CHECK (sync_status IN ('pending', 'synced', 'error'));

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_local_mapping
ON integration_entity_map(org_id, provider, entity_type, local_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_external_mapping
ON integration_entity_map(org_id, provider, entity_type, external_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_integration_org_provider_status
ON integration_entity_map(org_id, provider, entity_type, sync_status);

CREATE INDEX IF NOT EXISTS idx_integration_local_id
ON integration_entity_map(org_id, local_id);

CREATE INDEX IF NOT EXISTS idx_integration_external_id
ON integration_entity_map(org_id, external_id);

-- ============================================================================
-- SYNC STATUS STATE MACHINE ENFORCEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_sync_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check if status changed
  IF NEW.sync_status IS DISTINCT FROM OLD.sync_status THEN
    -- Validate allowed transitions
    IF OLD.sync_status = 'synced' AND NEW.sync_status = 'error' THEN
      RAISE EXCEPTION 'Cannot transition directly from synced to error. Must go through pending.';
    END IF;

    IF OLD.sync_status = 'error' AND NEW.sync_status = 'synced' THEN
      RAISE EXCEPTION 'Cannot transition directly from error to synced. Must go through pending first.';
    END IF;

    -- Only allow valid statuses
    IF NEW.sync_status NOT IN ('pending', 'synced', 'error') THEN
      RAISE EXCEPTION 'Invalid sync_status: %', NEW.sync_status;
    END IF;

    -- Moving to synced: set synced_at if null
    IF NEW.sync_status = 'synced' AND NEW.synced_at IS NULL THEN
      NEW.synced_at := now();
    END IF;

    -- Moving to error: sync_error must be non-empty
    IF NEW.sync_status = 'error' AND (NEW.sync_error IS NULL OR NEW.sync_error = '') THEN
      RAISE EXCEPTION 'sync_error must be set when moving to error status';
    END IF;

    -- Moving to pending: clear sync_error
    IF NEW.sync_status = 'pending' THEN
      NEW.sync_error := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sync_status_transitions ON integration_entity_map;
CREATE TRIGGER trg_enforce_sync_status_transitions
BEFORE UPDATE OF sync_status ON integration_entity_map
FOR EACH ROW
EXECUTE FUNCTION enforce_sync_status_transitions();

-- ============================================================================
-- SYNCED INVOICE LOCKING
-- ============================================================================

CREATE OR REPLACE FUNCTION check_if_invoice_synced(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM integration_entity_map
    WHERE entity_type = 'invoice'
      AND local_id = p_invoice_id
      AND sync_status = 'synced'
      AND provider IN ('quickbooks', 'xero')
  );
$$;

CREATE OR REPLACE FUNCTION prevent_synced_invoice_mutations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_synced boolean;
BEGIN
  v_is_synced := check_if_invoice_synced(OLD.id);

  IF v_is_synced THEN
    -- Block changes to accounting-critical fields
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
      RAISE EXCEPTION 'Cannot change customer_id on synced invoice';
    END IF;

    IF NEW.address_id IS DISTINCT FROM OLD.address_id THEN
      RAISE EXCEPTION 'Cannot change address_id on synced invoice';
    END IF;

    IF NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'Cannot change currency on synced invoice';
    END IF;

    IF NEW.tax_inclusive IS DISTINCT FROM OLD.tax_inclusive THEN
      RAISE EXCEPTION 'Cannot change tax_inclusive on synced invoice';
    END IF;

    IF NEW.default_tax_rate IS DISTINCT FROM OLD.default_tax_rate THEN
      RAISE EXCEPTION 'Cannot change default_tax_rate on synced invoice';
    END IF;

    IF NEW.labour_subtotal_cents IS DISTINCT FROM OLD.labour_subtotal_cents THEN
      RAISE EXCEPTION 'Cannot change labour_subtotal_cents on synced invoice';
    END IF;

    IF NEW.materials_subtotal_cents IS DISTINCT FROM OLD.materials_subtotal_cents THEN
      RAISE EXCEPTION 'Cannot change materials_subtotal_cents on synced invoice';
    END IF;

    IF NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents THEN
      RAISE EXCEPTION 'Cannot change subtotal_cents on synced invoice';
    END IF;

    IF NEW.tax_total_cents IS DISTINCT FROM OLD.tax_total_cents THEN
      RAISE EXCEPTION 'Cannot change tax_total_cents on synced invoice';
    END IF;

    IF NEW.grand_total_cents IS DISTINCT FROM OLD.grand_total_cents THEN
      RAISE EXCEPTION 'Cannot change grand_total_cents on synced invoice';
    END IF;

    IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number THEN
      RAISE EXCEPTION 'Cannot change invoice_number on synced invoice';
    END IF;

    IF NEW.invoice_date IS DISTINCT FROM OLD.invoice_date THEN
      RAISE EXCEPTION 'Cannot change invoice_date on synced invoice';
    END IF;

    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      RAISE EXCEPTION 'Cannot change due_date on synced invoice';
    END IF;

    IF NEW.invoice_snapshot IS DISTINCT FROM OLD.invoice_snapshot THEN
      RAISE EXCEPTION 'Cannot change invoice_snapshot on synced invoice';
    END IF;

    -- Allowed: amount_paid_cents, paid_at, status (via state machine)
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_synced_invoice_mutations ON invoices;
CREATE TRIGGER trg_prevent_synced_invoice_mutations
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION prevent_synced_invoice_mutations();

-- Prevent line item changes on synced invoices
CREATE OR REPLACE FUNCTION prevent_synced_invoice_line_item_mutations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id uuid;
  v_is_synced boolean;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_is_synced := check_if_invoice_synced(v_invoice_id);

  IF v_is_synced THEN
    RAISE EXCEPTION 'Cannot modify line items on synced invoice';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_synced_invoice_line_item_mutations ON invoice_line_items;
CREATE TRIGGER trg_prevent_synced_invoice_line_item_mutations
BEFORE INSERT OR UPDATE OR DELETE ON invoice_line_items
FOR EACH ROW
EXECUTE FUNCTION prevent_synced_invoice_line_item_mutations();

-- ============================================================================
-- SYNCED CUSTOMER PROTECTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_if_customer_synced(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM integration_entity_map
    WHERE entity_type = 'customer'
      AND local_id = p_customer_id
      AND sync_status = 'synced'
      AND provider IN ('quickbooks', 'xero')
  );
$$;

CREATE OR REPLACE FUNCTION prevent_synced_customer_deletion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_synced boolean;
BEGIN
  v_is_synced := check_if_customer_synced(OLD.id);

  IF v_is_synced THEN
    RAISE EXCEPTION 'Cannot delete synced customer';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_synced_customer_deletion ON customers;
CREATE TRIGGER trg_prevent_synced_customer_deletion
BEFORE DELETE ON customers
FOR EACH ROW
EXECUTE FUNCTION prevent_synced_customer_deletion();

CREATE OR REPLACE FUNCTION prevent_synced_customer_destructive_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_synced boolean;
BEGIN
  -- Always block org_id changes (prevents moving customers between orgs)
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'Cannot change org_id on customer';
  END IF;

  v_is_synced := check_if_customer_synced(OLD.id);

  IF v_is_synced THEN
    -- Block ID changes (destructive)
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Cannot change customer ID on synced customer';
    END IF;

    -- Allowed: name, email, phone, notes, company_name
    -- (contact information updates don't affect accounting integrity)
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_synced_customer_destructive_changes ON customers;
CREATE TRIGGER trg_prevent_synced_customer_destructive_changes
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION prevent_synced_customer_destructive_changes();
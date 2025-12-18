/*
  # Invoice System Implementation

  ## Overview
  Complete invoice system with zero duplication risk, using separate tables
  from quotes. Invoices are generated only from accepted quotes for MVP.

  ## 1. New Tables

  ### `invoices`
  - `id` (uuid, primary key)
  - `org_id` (uuid, FK to organizations)
  - `created_by_user_id` (uuid, FK to users)
  - `customer_id` (uuid, FK to customers, RESTRICT)
  - `address_id` (uuid, FK to customer_addresses, SET NULL)
  - `source_quote_id` (uuid, FK to quotes, RESTRICT, UNIQUE)
  - `invoice_number` (text, unique per org)
  - `title`, `description` (text)
  - `status` (text, enum: draft, issued, sent, overdue, paid, void)
  - `invoice_date`, `due_date` (date)
  - `currency` (text)
  - `tax_inclusive` (boolean)
  - `default_tax_rate` (numeric)
  - Money fields in cents: `labour_subtotal_cents`, `materials_subtotal_cents`, 
    `subtotal_cents`, `tax_total_cents`, `grand_total_cents`
  - Payment tracking: `amount_paid_cents`, `paid_at`
  - Timestamps: `issued_at`, `sent_at`, `voided_at`, `created_at`, `updated_at`
  - `invoice_snapshot` (jsonb, snapshot from accepted quote)

  ### `invoice_line_items`
  Mirrors quote_line_items structure with same fields

  ## 2. Security
  - RLS enabled on both tables
  - Authenticated users can only access invoices within their org
  - No public access for invoices
  - SECURITY DEFINER functions for invoice creation

  ## 3. Data Integrity
  - Totals are derived and protected from manual edits (guard trigger)
  - Automatic recalculation via triggers on line items
  - Row-level locking prevents race conditions
  - Supports tax-inclusive and tax-exclusive calculations

  ## 4. Immutability
  - Line items cannot be modified after invoice is issued
  - Customer binding and financial fields locked after issued
  - Status state machine enforces valid transitions
  - Amount paid must equal grand total for paid status

  ## 5. Status Machine
  - draft → issued → sent → overdue/paid
  - draft → issued → void
  - Timestamps auto-set on status transitions
  - End states (paid, void) cannot transition further

  ## 6. Conversion Function
  - `create_invoice_from_accepted_quote(quote_id)` creates invoice from accepted quote
  - Enforces one invoice per quote via unique constraint
  - Populates invoice_snapshot from quote's accepted_quote_snapshot
  - Auto-generates invoice_number per org
  - Sets status to issued automatically

  ## 7. Indexes
  - Primary key on id
  - org_id, created_at for listing
  - customer_id for customer view
  - status for filtering
  - source_quote_id unique constraint
  - Unique(org_id, invoice_number)
*/

-- ============================================================================
-- TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  address_id uuid REFERENCES customer_addresses(id) ON DELETE SET NULL,
  source_quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
  
  invoice_number text NOT NULL,
  title text,
  description text,
  
  status text NOT NULL DEFAULT 'draft',
  
  invoice_date date,
  due_date date,
  
  currency text NOT NULL DEFAULT 'AUD',
  tax_inclusive boolean NOT NULL DEFAULT true,
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 10.00,
  
  labour_subtotal_cents bigint NOT NULL DEFAULT 0,
  materials_subtotal_cents bigint NOT NULL DEFAULT 0,
  subtotal_cents bigint NOT NULL DEFAULT 0,
  tax_total_cents bigint NOT NULL DEFAULT 0,
  grand_total_cents bigint NOT NULL DEFAULT 0,
  
  amount_paid_cents bigint NOT NULL DEFAULT 0,
  paid_at timestamptz,
  
  issued_at timestamptz,
  sent_at timestamptz,
  voided_at timestamptz,
  
  invoice_snapshot jsonb NOT NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT check_invoice_status CHECK (status IN ('draft', 'issued', 'sent', 'overdue', 'paid', 'void')),
  CONSTRAINT check_invoice_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT check_invoice_tax_rate CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100),
  CONSTRAINT check_invoice_amounts CHECK (
    labour_subtotal_cents >= 0
    AND materials_subtotal_cents >= 0
    AND subtotal_cents >= 0
    AND tax_total_cents >= 0
    AND grand_total_cents >= 0
    AND amount_paid_cents >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_number_per_org
ON invoices(org_id, invoice_number);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_source_quote
ON invoices(source_quote_id);

CREATE INDEX IF NOT EXISTS idx_invoices_org_created
ON invoices(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_customer
ON invoices(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_status
ON invoices(status);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  item_type text NOT NULL,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1.00,
  unit_price_cents bigint NOT NULL,
  line_total_cents bigint NOT NULL,
  position integer NOT NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT check_invoice_line_item_type CHECK (item_type IN ('labour', 'material', 'other')),
  CONSTRAINT check_invoice_line_quantity CHECK (quantity > 0),
  CONSTRAINT check_invoice_line_unit_price CHECK (unit_price_cents >= 0),
  CONSTRAINT check_invoice_line_total CHECK (line_total_cents >= 0),
  CONSTRAINT check_invoice_line_position CHECK (position >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_line_items_position
ON invoice_line_items(invoice_id, position);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice
ON invoice_line_items(invoice_id, position);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org invoices" ON invoices;
CREATE POLICY "Users can view org invoices"
ON invoices FOR SELECT
TO authenticated
USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can create org invoices" ON invoices;
CREATE POLICY "Users can create org invoices"
ON invoices FOR INSERT
TO authenticated
WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update org invoices" ON invoices;
CREATE POLICY "Users can update org invoices"
ON invoices FOR UPDATE
TO authenticated
USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()))
WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete org invoices" ON invoices;
CREATE POLICY "Users can delete org invoices"
ON invoices FOR DELETE
TO authenticated
USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can view org invoice line items" ON invoice_line_items;
CREATE POLICY "Users can view org invoice line items"
ON invoice_line_items FOR SELECT
TO authenticated
USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can create org invoice line items" ON invoice_line_items;
CREATE POLICY "Users can create org invoice line items"
ON invoice_line_items FOR INSERT
TO authenticated
WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update org invoice line items" ON invoice_line_items;
CREATE POLICY "Users can update org invoice line items"
ON invoice_line_items FOR UPDATE
TO authenticated
USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()))
WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete org invoice line items" ON invoice_line_items;
CREATE POLICY "Users can delete org invoice line items"
ON invoice_line_items FOR DELETE
TO authenticated
USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- ============================================================================
-- TOTALS ENFORCEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION invoice_totals_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('invoice_totals.recalc', true) IS DISTINCT FROM 'on' THEN
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

DROP TRIGGER IF EXISTS trg_invoice_totals_guard ON invoices;
CREATE TRIGGER trg_invoice_totals_guard
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION invoice_totals_guard();

CREATE OR REPLACE FUNCTION recalculate_invoice_totals(p_invoice_id uuid)
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
  PERFORM 1 FROM invoices WHERE id = p_invoice_id FOR UPDATE;

  SELECT default_tax_rate, tax_inclusive
  INTO v_tax_rate, v_tax_inclusive
  FROM invoices
  WHERE id = p_invoice_id;

  SELECT
    COALESCE(SUM(CASE WHEN item_type = 'labour' THEN line_total_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type != 'labour' THEN line_total_cents ELSE 0 END), 0),
    COALESCE(SUM(line_total_cents), 0)
  INTO v_labour_total, v_materials_total, v_subtotal
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id;

  IF v_tax_inclusive THEN
    v_tax_total := ROUND(v_subtotal * v_tax_rate / (100 + v_tax_rate));
    v_grand_total := v_subtotal;
  ELSE
    v_tax_total := ROUND(v_subtotal * v_tax_rate / 100);
    v_grand_total := v_subtotal + v_tax_total;
  END IF;

  PERFORM set_config('invoice_totals.recalc', 'on', true);

  UPDATE invoices
  SET
    labour_subtotal_cents = v_labour_total,
    materials_subtotal_cents = v_materials_total,
    subtotal_cents = v_subtotal,
    tax_total_cents = v_tax_total,
    grand_total_cents = v_grand_total,
    updated_at = now()
  WHERE id = p_invoice_id;

  PERFORM set_config('invoice_totals.recalc', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION invoice_line_items_recalc_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  PERFORM recalculate_invoice_totals(v_invoice_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_line_items_recalc ON invoice_line_items;
CREATE TRIGGER trg_invoice_line_items_recalc
AFTER INSERT OR UPDATE OR DELETE ON invoice_line_items
FOR EACH ROW
EXECUTE FUNCTION invoice_line_items_recalc_trigger();

-- ============================================================================
-- IMMUTABILITY: PREVENT LINE ITEM CHANGES AFTER ISSUED
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_invoice_line_item_mutations_if_locked()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  IF v_status IN ('issued', 'sent', 'overdue', 'paid', 'void') THEN
    RAISE EXCEPTION 'Line items cannot be modified after invoice is issued';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_invoice_line_item_mutations_if_locked ON invoice_line_items;
CREATE TRIGGER trg_prevent_invoice_line_item_mutations_if_locked
BEFORE INSERT OR UPDATE OR DELETE ON invoice_line_items
FOR EACH ROW
EXECUTE FUNCTION prevent_invoice_line_item_mutations_if_locked();

-- ============================================================================
-- IMMUTABILITY: PREVENT INVOICE CHANGES AFTER ISSUED
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_invoice_mutations_after_issued()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('issued', 'sent', 'overdue', 'paid', 'void') THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.address_id IS DISTINCT FROM OLD.address_id
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.default_tax_rate IS DISTINCT FROM OLD.default_tax_rate
      OR NEW.tax_inclusive IS DISTINCT FROM OLD.tax_inclusive
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
      OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      RAISE EXCEPTION 'Invoice financial and customer fields are immutable after issued';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_invoice_mutations_after_issued ON invoices;
CREATE TRIGGER trg_prevent_invoice_mutations_after_issued
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION prevent_invoice_mutations_after_issued();

-- ============================================================================
-- STATUS STATE MACHINE
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_invoice_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Validate transitions
    IF OLD.status = 'draft' AND NEW.status NOT IN ('issued', 'void') THEN
      RAISE EXCEPTION 'Invalid status transition from draft to %', NEW.status;
    END IF;

    IF OLD.status = 'issued' AND NEW.status NOT IN ('sent', 'void') THEN
      RAISE EXCEPTION 'Invalid status transition from issued to %', NEW.status;
    END IF;

    IF OLD.status = 'sent' AND NEW.status NOT IN ('overdue', 'paid', 'void') THEN
      RAISE EXCEPTION 'Invalid status transition from sent to %', NEW.status;
    END IF;

    IF OLD.status = 'overdue' AND NEW.status NOT IN ('paid', 'void') THEN
      RAISE EXCEPTION 'Invalid status transition from overdue to %', NEW.status;
    END IF;

    IF OLD.status IN ('paid', 'void') THEN
      RAISE EXCEPTION 'End state % cannot transition', OLD.status;
    END IF;

    -- Auto-set timestamps
    IF NEW.status = 'issued' AND NEW.issued_at IS NULL THEN
      NEW.issued_at := now();
    END IF;

    IF NEW.status = 'sent' AND NEW.sent_at IS NULL THEN
      NEW.sent_at := now();
    END IF;

    IF NEW.status = 'void' AND NEW.voided_at IS NULL THEN
      NEW.voided_at := now();
    END IF;

    IF NEW.status = 'paid' THEN
      IF NEW.amount_paid_cents <> NEW.grand_total_cents THEN
        RAISE EXCEPTION 'Cannot mark as paid: amount_paid_cents must equal grand_total_cents';
      END IF;
      IF NEW.paid_at IS NULL THEN
        NEW.paid_at := now();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_status_transitions ON invoices;
CREATE TRIGGER trg_enforce_invoice_status_transitions
BEFORE UPDATE OF status ON invoices
FOR EACH ROW
EXECUTE FUNCTION enforce_invoice_status_transitions();

-- ============================================================================
-- INVOICE NUMBER GENERATION
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_invoice_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_number integer;
  v_invoice_number text;
BEGIN
  SELECT COALESCE(MAX(
    CASE 
      WHEN invoice_number ~ '^INV-[0-9]+$' 
      THEN (regexp_match(invoice_number, '^INV-([0-9]+)$'))[1]::integer
      ELSE 0
    END
  ), 0) + 1
  INTO v_next_number
  FROM invoices
  WHERE org_id = p_org_id;

  v_invoice_number := 'INV-' || LPAD(v_next_number::text, 5, '0');

  RETURN v_invoice_number;
END;
$$;

-- ============================================================================
-- CONVERSION FUNCTION: CREATE INVOICE FROM ACCEPTED QUOTE
-- ============================================================================

CREATE OR REPLACE FUNCTION create_invoice_from_accepted_quote(p_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote quotes%ROWTYPE;
  v_invoice_id uuid;
  v_invoice_number text;
  v_line_item jsonb;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if invoice already exists for this quote
  IF EXISTS (SELECT 1 FROM invoices WHERE source_quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'Invoice already exists for this quote';
  END IF;

  -- Get quote and validate it's accepted
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'Quote must be accepted before creating invoice';
  END IF;

  IF v_quote.accepted_quote_snapshot IS NULL THEN
    RAISE EXCEPTION 'Quote missing acceptance snapshot';
  END IF;

  -- Verify user belongs to same org
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_id AND org_id = v_quote.org_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Generate invoice number
  v_invoice_number := generate_invoice_number(v_quote.org_id);

  -- Create invoice
  INSERT INTO invoices (
    org_id,
    created_by_user_id,
    customer_id,
    address_id,
    source_quote_id,
    invoice_number,
    title,
    description,
    status,
    invoice_date,
    due_date,
    currency,
    tax_inclusive,
    default_tax_rate,
    invoice_snapshot,
    issued_at
  ) VALUES (
    v_quote.org_id,
    v_user_id,
    v_quote.customer_id,
    v_quote.address_id,
    v_quote.id,
    v_invoice_number,
    v_quote.title,
    v_quote.description,
    'issued',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    v_quote.currency,
    v_quote.tax_inclusive,
    v_quote.default_tax_rate,
    v_quote.accepted_quote_snapshot,
    now()
  )
  RETURNING id INTO v_invoice_id;

  -- Insert line items from snapshot
  FOR v_line_item IN 
    SELECT * FROM jsonb_array_elements(v_quote.accepted_quote_snapshot->'line_items')
  LOOP
    INSERT INTO invoice_line_items (
      org_id,
      invoice_id,
      item_type,
      description,
      quantity,
      unit_price_cents,
      line_total_cents,
      position
    ) VALUES (
      v_quote.org_id,
      v_invoice_id,
      v_line_item->>'item_type',
      v_line_item->>'description',
      (v_line_item->>'quantity')::numeric,
      (v_line_item->>'unit_price_cents')::bigint,
      (v_line_item->>'line_total_cents')::bigint,
      (v_line_item->>'position')::integer
    );
  END LOOP;

  -- Recalculate totals
  PERFORM recalculate_invoice_totals(v_invoice_id);

  -- Update quote status to invoiced
  UPDATE quotes SET status = 'invoiced' WHERE id = p_quote_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_invoice_from_accepted_quote(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_invoice_totals(uuid) TO authenticated;

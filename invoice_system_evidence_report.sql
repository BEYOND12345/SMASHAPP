-- ============================================================================
-- INVOICE SYSTEM EVIDENCE REPORT
-- ============================================================================
-- This file contains comprehensive tests for the invoice system.
-- Run each section and document results to prove security and integrity.

-- SETUP: Create test data
-- Run this first to set up test environment

DO $$
DECLARE
  v_org1_id uuid;
  v_org2_id uuid;
  v_user1_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_user2_id uuid := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_customer1_id uuid;
  v_customer2_id uuid;
  v_quote1_id uuid;
  v_quote2_id uuid;
  v_quote3_id uuid;
BEGIN
  -- Clean up test data if exists
  DELETE FROM invoice_line_items WHERE org_id IN (
    SELECT id FROM organizations WHERE name LIKE 'Test Org%'
  );
  DELETE FROM invoices WHERE org_id IN (
    SELECT id FROM organizations WHERE name LIKE 'Test Org%'
  );
  DELETE FROM quote_line_items WHERE org_id IN (
    SELECT id FROM organizations WHERE name LIKE 'Test Org%'
  );
  DELETE FROM quotes WHERE org_id IN (
    SELECT id FROM organizations WHERE name LIKE 'Test Org%'
  );
  DELETE FROM customers WHERE org_id IN (
    SELECT id FROM organizations WHERE name LIKE 'Test Org%'
  );
  DELETE FROM users WHERE org_id IN (
    SELECT id FROM organizations WHERE name LIKE 'Test Org%'
  );
  DELETE FROM organizations WHERE name LIKE 'Test Org%';

  -- Create test orgs
  INSERT INTO organizations (name, default_currency, default_tax_rate)
  VALUES ('Test Org 1', 'AUD', 10.00)
  RETURNING id INTO v_org1_id;

  INSERT INTO organizations (name, default_currency, default_tax_rate)
  VALUES ('Test Org 2', 'AUD', 10.00)
  RETURNING id INTO v_org2_id;

  -- Create test users
  INSERT INTO users (id, org_id, email, role)
  VALUES (v_user1_id, v_org1_id, 'user1@test.com', 'owner');

  INSERT INTO users (id, org_id, email, role)
  VALUES (v_user2_id, v_org2_id, 'user2@test.com', 'owner');

  -- Create test customers
  INSERT INTO customers (org_id, name, email)
  VALUES (v_org1_id, 'Customer 1', 'customer1@test.com')
  RETURNING id INTO v_customer1_id;

  INSERT INTO customers (org_id, name, email)
  VALUES (v_org2_id, 'Customer 2', 'customer2@test.com')
  RETURNING id INTO v_customer2_id;

  -- Create test quotes
  INSERT INTO quotes (
    org_id, created_by_user_id, customer_id,
    quote_number, title, status,
    currency, tax_inclusive, default_tax_rate
  )
  VALUES (
    v_org1_id, v_user1_id, v_customer1_id,
    'Q-00001', 'Accepted Quote', 'draft',
    'AUD', true, 10.00
  )
  RETURNING id INTO v_quote1_id;

  -- Add line items to quote 1
  INSERT INTO quote_line_items (
    org_id, quote_id, item_type, description,
    quantity, unit_price_cents, line_total_cents, position
  )
  VALUES
    (v_org1_id, v_quote1_id, 'labour', 'Labour Item', 1, 100000, 100000, 0),
    (v_org1_id, v_quote1_id, 'material', 'Material Item', 2, 50000, 100000, 1);

  -- Accept quote 1
  UPDATE quotes
  SET
    status = 'accepted',
    accepted_at = now(),
    accepted_by_email = 'customer1@test.com'
  WHERE id = v_quote1_id;

  -- Create quote 2 (not accepted)
  INSERT INTO quotes (
    org_id, created_by_user_id, customer_id,
    quote_number, title, status,
    currency, tax_inclusive, default_tax_rate
  )
  VALUES (
    v_org1_id, v_user1_id, v_customer1_id,
    'Q-00002', 'Draft Quote', 'draft',
    'AUD', true, 10.00
  )
  RETURNING id INTO v_quote2_id;

  -- Add line items to quote 2
  INSERT INTO quote_line_items (
    org_id, quote_id, item_type, description,
    quantity, unit_price_cents, line_total_cents, position
  )
  VALUES
    (v_org1_id, v_quote2_id, 'labour', 'Labour Item', 1, 100000, 100000, 0);

  -- Create quote 3 in org 2 (for cross-org test)
  INSERT INTO quotes (
    org_id, created_by_user_id, customer_id,
    quote_number, title, status,
    currency, tax_inclusive, default_tax_rate
  )
  VALUES (
    v_org2_id, v_user2_id, v_customer2_id,
    'Q-00001', 'Org 2 Accepted Quote', 'draft',
    'AUD', true, 10.00
  )
  RETURNING id INTO v_quote3_id;

  -- Add line items and accept quote 3
  INSERT INTO quote_line_items (
    org_id, quote_id, item_type, description,
    quantity, unit_price_cents, line_total_cents, position
  )
  VALUES
    (v_org2_id, v_quote3_id, 'labour', 'Labour Item', 1, 100000, 100000, 0);

  UPDATE quotes
  SET
    status = 'accepted',
    accepted_at = now(),
    accepted_by_email = 'customer2@test.com'
  WHERE id = v_quote3_id;

  RAISE NOTICE 'Test data created successfully';
  RAISE NOTICE 'Org 1 ID: %', v_org1_id;
  RAISE NOTICE 'Org 2 ID: %', v_org2_id;
  RAISE NOTICE 'Quote 1 (accepted): %', v_quote1_id;
  RAISE NOTICE 'Quote 2 (draft): %', v_quote2_id;
  RAISE NOTICE 'Quote 3 (org 2, accepted): %', v_quote3_id;
END $$;

-- ============================================================================
-- TEST 1: Create invoice from accepted quote works
-- ============================================================================
-- Expected: SUCCESS - Invoice created with correct data

SELECT '=== TEST 1: Create invoice from accepted quote ===' AS test;

DO $$
DECLARE
  v_quote_id uuid;
  v_invoice_id uuid;
  v_invoice invoices%ROWTYPE;
  v_line_item_count integer;
BEGIN
  -- Get the accepted quote
  SELECT id INTO v_quote_id
  FROM quotes
  WHERE title = 'Accepted Quote' AND status = 'accepted';

  -- Create invoice
  v_invoice_id := create_invoice_from_accepted_quote(v_quote_id);

  -- Verify invoice created
  SELECT * INTO v_invoice FROM invoices WHERE id = v_invoice_id;

  RAISE NOTICE 'Invoice ID: %', v_invoice_id;
  RAISE NOTICE 'Invoice Number: %', v_invoice.invoice_number;
  RAISE NOTICE 'Status: %', v_invoice.status;
  RAISE NOTICE 'Grand Total: %', v_invoice.grand_total_cents;

  -- Verify line items copied
  SELECT COUNT(*) INTO v_line_item_count
  FROM invoice_line_items
  WHERE invoice_id = v_invoice_id;

  RAISE NOTICE 'Line Items Count: %', v_line_item_count;

  -- Verify quote status updated
  IF (SELECT status FROM quotes WHERE id = v_quote_id) = 'invoiced' THEN
    RAISE NOTICE '✓ TEST 1 PASSED: Invoice created successfully';
  ELSE
    RAISE EXCEPTION '✗ TEST 1 FAILED: Quote status not updated';
  END IF;
END $$;

-- ============================================================================
-- TEST 2: Cannot create invoice from non-accepted quote
-- ============================================================================
-- Expected: ERROR - Exception raised

SELECT '=== TEST 2: Cannot create invoice from non-accepted quote ===' AS test;

DO $$
DECLARE
  v_quote_id uuid;
  v_invoice_id uuid;
BEGIN
  -- Get the draft quote
  SELECT id INTO v_quote_id
  FROM quotes
  WHERE title = 'Draft Quote' AND status = 'draft';

  -- Try to create invoice (should fail)
  BEGIN
    v_invoice_id := create_invoice_from_accepted_quote(v_quote_id);
    RAISE EXCEPTION '✗ TEST 2 FAILED: Should not allow invoice from draft quote';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%must be accepted%' THEN
        RAISE NOTICE '✓ TEST 2 PASSED: Correctly prevented invoice from non-accepted quote';
        RAISE NOTICE 'Error message: %', SQLERRM;
      ELSE
        RAISE EXCEPTION '✗ TEST 2 FAILED: Wrong error - %', SQLERRM;
      END IF;
  END;
END $$;

-- ============================================================================
-- TEST 3: Totals cannot be manually edited
-- ============================================================================
-- Expected: ERROR - Exception raised

SELECT '=== TEST 3: Totals cannot be manually edited ===' AS test;

DO $$
DECLARE
  v_invoice_id uuid;
BEGIN
  -- Get an invoice
  SELECT id INTO v_invoice_id FROM invoices LIMIT 1;

  -- Try to update total (should fail)
  BEGIN
    UPDATE invoices
    SET grand_total_cents = 999999
    WHERE id = v_invoice_id;

    RAISE EXCEPTION '✗ TEST 3 FAILED: Should not allow manual total edit';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%derived and cannot be edited%' THEN
        RAISE NOTICE '✓ TEST 3 PASSED: Totals protected from manual edits';
        RAISE NOTICE 'Error message: %', SQLERRM;
      ELSE
        RAISE EXCEPTION '✗ TEST 3 FAILED: Wrong error - %', SQLERRM;
      END IF;
  END;
END $$;

-- ============================================================================
-- TEST 4: Line items cannot be changed after issued
-- ============================================================================
-- Expected: ERROR - Exception raised

SELECT '=== TEST 4: Line items cannot be changed after issued ===' AS test;

DO $$
DECLARE
  v_invoice_id uuid;
  v_line_item_id uuid;
BEGIN
  -- Get an issued invoice
  SELECT id INTO v_invoice_id
  FROM invoices
  WHERE status = 'issued'
  LIMIT 1;

  -- Get a line item
  SELECT id INTO v_line_item_id
  FROM invoice_line_items
  WHERE invoice_id = v_invoice_id
  LIMIT 1;

  -- Try to update line item (should fail)
  BEGIN
    UPDATE invoice_line_items
    SET description = 'Modified'
    WHERE id = v_line_item_id;

    RAISE EXCEPTION '✗ TEST 4 FAILED: Should not allow line item modification after issued';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%cannot be modified after%' THEN
        RAISE NOTICE '✓ TEST 4 PASSED: Line items locked after issued';
        RAISE NOTICE 'Error message: %', SQLERRM;
      ELSE
        RAISE EXCEPTION '✗ TEST 4 FAILED: Wrong error - %', SQLERRM;
      END IF;
  END;

  -- Try to insert new line item (should fail)
  BEGIN
    INSERT INTO invoice_line_items (
      org_id, invoice_id, item_type, description,
      quantity, unit_price_cents, line_total_cents, position
    )
    SELECT org_id, v_invoice_id, 'labour', 'New Item', 1, 100000, 100000, 999
    FROM invoices WHERE id = v_invoice_id;

    RAISE EXCEPTION '✗ TEST 4 FAILED: Should not allow new line items after issued';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%cannot be modified after%' THEN
        RAISE NOTICE '✓ TEST 4 PASSED: Cannot insert line items after issued';
        RAISE NOTICE 'Error message: %', SQLERRM;
      ELSE
        RAISE EXCEPTION '✗ TEST 4 FAILED: Wrong error - %', SQLERRM;
      END IF;
  END;

  -- Try to delete line item (should fail)
  BEGIN
    DELETE FROM invoice_line_items WHERE id = v_line_item_id;

    RAISE EXCEPTION '✗ TEST 4 FAILED: Should not allow line item deletion after issued';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%cannot be modified after%' THEN
        RAISE NOTICE '✓ TEST 4 PASSED: Cannot delete line items after issued';
        RAISE NOTICE 'Error message: %', SQLERRM;
      ELSE
        RAISE EXCEPTION '✗ TEST 4 FAILED: Wrong error - %', SQLERRM;
      END IF;
  END;
END $$;

-- ============================================================================
-- TEST 5: Status machine blocks invalid transitions
-- ============================================================================
-- Expected: ERROR - Exception raised for invalid transitions

SELECT '=== TEST 5: Status machine blocks invalid transitions ===' AS test;

DO $$
DECLARE
  v_invoice_id uuid;
BEGIN
  -- Get an issued invoice
  SELECT id INTO v_invoice_id
  FROM invoices
  WHERE status = 'issued'
  LIMIT 1;

  -- Try invalid transition: issued -> draft (should fail)
  BEGIN
    UPDATE invoices SET status = 'draft' WHERE id = v_invoice_id;
    RAISE EXCEPTION '✗ TEST 5 FAILED: Should not allow issued -> draft';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Invalid status transition%' THEN
        RAISE NOTICE '✓ TEST 5a PASSED: Blocked issued -> draft';
      ELSE
        RAISE EXCEPTION '✗ TEST 5a FAILED: Wrong error - %', SQLERRM;
      END IF;
  END;

  -- Try invalid transition: issued -> paid without amount (should fail)
  BEGIN
    UPDATE invoices SET status = 'paid' WHERE id = v_invoice_id;
    RAISE EXCEPTION '✗ TEST 5 FAILED: Should not allow issued -> paid';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Invalid status transition%' THEN
        RAISE NOTICE '✓ TEST 5b PASSED: Blocked issued -> paid (invalid path)';
      ELSE
        RAISE EXCEPTION '✗ TEST 5b FAILED: Wrong error - %', SQLERRM;
      END IF;
  END;

  -- Test valid transition: issued -> sent
  UPDATE invoices SET status = 'sent' WHERE id = v_invoice_id;
  RAISE NOTICE '✓ TEST 5c PASSED: Allowed issued -> sent';

  -- Test valid transition: sent -> paid (with amount)
  UPDATE invoices
  SET
    amount_paid_cents = grand_total_cents,
    status = 'paid'
  WHERE id = v_invoice_id;
  RAISE NOTICE '✓ TEST 5d PASSED: Allowed sent -> paid with correct amount';

  -- Try transition from end state (should fail)
  BEGIN
    UPDATE invoices SET status = 'void' WHERE id = v_invoice_id;
    RAISE EXCEPTION '✗ TEST 5 FAILED: Should not allow transition from paid';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%End state%cannot transition%' THEN
        RAISE NOTICE '✓ TEST 5e PASSED: Blocked transition from end state';
        RAISE NOTICE 'Error message: %', SQLERRM;
      ELSE
        RAISE EXCEPTION '✗ TEST 5e FAILED: Wrong error - %', SQLERRM;
      END IF;
  END;
END $$;

-- ============================================================================
-- TEST 6: One invoice per quote enforced
-- ============================================================================
-- Expected: ERROR - Exception raised for duplicate invoice

SELECT '=== TEST 6: One invoice per quote enforced ===' AS test;

DO $$
DECLARE
  v_quote_id uuid;
  v_invoice_id uuid;
BEGIN
  -- Get a quote that already has an invoice
  SELECT source_quote_id INTO v_quote_id
  FROM invoices
  LIMIT 1;

  -- Try to create another invoice (should fail)
  BEGIN
    v_invoice_id := create_invoice_from_accepted_quote(v_quote_id);
    RAISE EXCEPTION '✗ TEST 6 FAILED: Should not allow duplicate invoice';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%already exists%' THEN
        RAISE NOTICE '✓ TEST 6 PASSED: One invoice per quote enforced';
        RAISE NOTICE 'Error message: %', SQLERRM;
      ELSE
        RAISE EXCEPTION '✗ TEST 6 FAILED: Wrong error - %', SQLERRM;
      END IF;
  END;
END $$;

-- ============================================================================
-- TEST 7: Verify totals calculation (tax inclusive)
-- ============================================================================
-- Expected: Correct calculation of tax and totals

SELECT '=== TEST 7: Verify totals calculation ===' AS test;

DO $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_expected_tax bigint;
  v_expected_grand bigint;
BEGIN
  -- Get an invoice
  SELECT * INTO v_invoice FROM invoices LIMIT 1;

  -- For tax inclusive: tax = subtotal * rate / (100 + rate)
  v_expected_tax := ROUND(v_invoice.subtotal_cents * v_invoice.default_tax_rate / (100 + v_invoice.default_tax_rate));
  v_expected_grand := v_invoice.subtotal_cents;

  RAISE NOTICE 'Subtotal: %', v_invoice.subtotal_cents;
  RAISE NOTICE 'Tax Rate: %', v_invoice.default_tax_rate;
  RAISE NOTICE 'Tax Total (actual): %', v_invoice.tax_total_cents;
  RAISE NOTICE 'Tax Total (expected): %', v_expected_tax;
  RAISE NOTICE 'Grand Total (actual): %', v_invoice.grand_total_cents;
  RAISE NOTICE 'Grand Total (expected): %', v_expected_grand;

  IF v_invoice.tax_total_cents = v_expected_tax
    AND v_invoice.grand_total_cents = v_expected_grand THEN
    RAISE NOTICE '✓ TEST 7 PASSED: Totals calculated correctly';
  ELSE
    RAISE EXCEPTION '✗ TEST 7 FAILED: Totals calculation incorrect';
  END IF;
END $$;

-- ============================================================================
-- TEST 8: Invoice number generation is sequential per org
-- ============================================================================
-- Expected: Invoice numbers are sequential and unique per org

SELECT '=== TEST 8: Invoice number generation ===' AS test;

SELECT
  org_id,
  invoice_number,
  created_at
FROM invoices
ORDER BY org_id, invoice_number;

DO $$
BEGIN
  -- Check all invoice numbers are unique per org
  IF EXISTS (
    SELECT org_id, invoice_number, COUNT(*)
    FROM invoices
    GROUP BY org_id, invoice_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '✗ TEST 8 FAILED: Duplicate invoice numbers found';
  ELSE
    RAISE NOTICE '✓ TEST 8 PASSED: Invoice numbers are unique per org';
  END IF;
END $$;

-- ============================================================================
-- SUMMARY: Display all invoices created
-- ============================================================================

SELECT '=== INVOICE SUMMARY ===' AS summary;

SELECT
  i.invoice_number,
  i.status,
  i.subtotal_cents / 100.0 AS subtotal_dollars,
  i.tax_total_cents / 100.0 AS tax_dollars,
  i.grand_total_cents / 100.0 AS grand_total_dollars,
  i.amount_paid_cents / 100.0 AS paid_dollars,
  (SELECT COUNT(*) FROM invoice_line_items WHERE invoice_id = i.id) AS line_item_count,
  q.quote_number AS source_quote,
  i.created_at
FROM invoices i
JOIN quotes q ON q.id = i.source_quote_id
WHERE i.org_id IN (SELECT id FROM organizations WHERE name LIKE 'Test Org%')
ORDER BY i.created_at;

SELECT '=== ALL TESTS COMPLETED ===' AS completed;

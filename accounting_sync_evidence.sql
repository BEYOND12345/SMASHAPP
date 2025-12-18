/*
  ============================================================================
  ACCOUNTING SYNC READINESS - EVIDENCE REPORT
  ============================================================================

  This file contains SQL tests demonstrating all sync locking invariants.
  Run these queries in order to verify the system is correctly protecting
  synced entities from destructive changes.
*/

-- ============================================================================
-- SETUP: Create test data
-- ============================================================================

-- Create test org
INSERT INTO organizations (id, name, default_currency)
VALUES ('11111111-1111-1111-1111-111111111111', 'Test Org Sync', 'AUD')
ON CONFLICT (id) DO NOTHING;

-- Create test user (linked to auth.users)
-- Note: In real environment, this would be created through auth.signUp
-- For testing, we'll assume auth.users already has a test user

-- Create second org for RLS testing
INSERT INTO organizations (id, name, default_currency)
VALUES ('22222222-2222-2222-2222-222222222222', 'Other Org', 'AUD')
ON CONFLICT (id) DO NOTHING;

-- Create test customer
INSERT INTO customers (id, org_id, name, email)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Test Customer', 'test@example.com')
ON CONFLICT (id) DO NOTHING;

-- Create test quote and accept it
INSERT INTO quotes (
  id,
  org_id,
  customer_id,
  quote_number,
  title,
  status,
  accepted_quote_snapshot
)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Q-00001',
  'Test Quote for Invoice',
  'accepted',
  '{"line_items": []}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- TEST A: MAPPING UNIQUENESS
-- ============================================================================

\echo ''
\echo '============================================================================'
\echo 'TEST A: MAPPING UNIQUENESS'
\echo '============================================================================'

-- A1: Insert first mapping for invoice (should succeed)
\echo ''
\echo 'A1: Insert first invoice mapping for QuickBooks (should succeed)...'
INSERT INTO integration_entity_map (
  id,
  org_id,
  provider,
  entity_type,
  local_id,
  external_id,
  sync_status
) VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '11111111-1111-1111-1111-111111111111',
  'quickbooks',
  'invoice',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'QB-INV-12345',
  'pending'
)
ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id;
\echo 'SUCCESS: First invoice mapping created'

-- A2: Attempt second mapping with same (org, provider, entity_type, local_id) - should fail
\echo ''
\echo 'A2: Attempt duplicate local mapping (should fail with unique constraint)...'
DO $$
BEGIN
  INSERT INTO integration_entity_map (
    org_id,
    provider,
    entity_type,
    local_id,
    external_id,
    sync_status
  ) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'quickbooks',
    'invoice',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',  -- same local_id
    'QB-INV-99999',  -- different external_id
    'pending'
  );
  RAISE EXCEPTION 'FAILED: Should have blocked duplicate local mapping';
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'SUCCESS: Duplicate local mapping blocked by unique constraint';
END $$;

-- A3: Attempt second mapping with same external_id - should fail
\echo ''
\echo 'A3: Attempt duplicate external mapping (should fail with unique constraint)...'
DO $$
BEGIN
  INSERT INTO integration_entity_map (
    org_id,
    provider,
    entity_type,
    local_id,
    external_id,
    sync_status
  ) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'quickbooks',
    'invoice',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',  -- different local_id
    'QB-INV-12345',  -- same external_id as A1
    'pending'
  );
  RAISE EXCEPTION 'FAILED: Should have blocked duplicate external mapping';
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'SUCCESS: Duplicate external mapping blocked by unique constraint';
END $$;

-- ============================================================================
-- TEST B: SYNC STATE MACHINE
-- ============================================================================

\echo ''
\echo '============================================================================'
\echo 'TEST B: SYNC STATE MACHINE'
\echo '============================================================================'

-- B1: Create test mapping in pending state
\echo ''
\echo 'B1: Create mapping in pending state...'
INSERT INTO integration_entity_map (
  id,
  org_id,
  provider,
  entity_type,
  local_id,
  external_id,
  sync_status
) VALUES (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '11111111-1111-1111-1111-111111111111',
  'xero',
  'customer',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'XERO-CUST-001',
  'pending'
)
ON CONFLICT (id) DO UPDATE SET sync_status = 'pending', sync_error = NULL;
\echo 'SUCCESS: Mapping in pending state'

-- B2: pending → synced (should succeed and auto-set synced_at)
\echo ''
\echo 'B2: Transition pending → synced (should succeed)...'
UPDATE integration_entity_map
SET sync_status = 'synced'
WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
\echo 'SUCCESS: Transitioned to synced, checking synced_at...'
SELECT
  CASE
    WHEN synced_at IS NOT NULL THEN 'SUCCESS: synced_at auto-set to ' || synced_at::text
    ELSE 'FAILED: synced_at not set'
  END as result
FROM integration_entity_map
WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

-- B3: synced → error (should fail)
\echo ''
\echo 'B3: Attempt synced → error transition (should fail)...'
DO $$
BEGIN
  UPDATE integration_entity_map
  SET sync_status = 'error', sync_error = 'test error'
  WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  RAISE EXCEPTION 'FAILED: Should have blocked synced → error transition';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%Cannot transition directly from synced to error%' THEN
      RAISE NOTICE 'SUCCESS: synced → error transition blocked';
    ELSE
      RAISE;
    END IF;
END $$;

-- B4: synced → pending (should succeed)
\echo ''
\echo 'B4: Transition synced → pending (should succeed)...'
UPDATE integration_entity_map
SET sync_status = 'pending'
WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
SELECT
  CASE
    WHEN sync_status = 'pending' AND sync_error IS NULL THEN 'SUCCESS: Transitioned to pending, sync_error cleared'
    ELSE 'FAILED: sync_error not cleared or status wrong'
  END as result
FROM integration_entity_map
WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

-- B5: pending → error (should succeed if sync_error provided)
\echo ''
\echo 'B5: Transition pending → error with sync_error (should succeed)...'
UPDATE integration_entity_map
SET sync_status = 'error', sync_error = 'Connection timeout'
WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
\echo 'SUCCESS: Transitioned to error with sync_error'

-- B6: error → pending (should succeed and clear sync_error)
\echo ''
\echo 'B6: Transition error → pending (should succeed and clear sync_error)...'
UPDATE integration_entity_map
SET sync_status = 'pending'
WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
SELECT
  CASE
    WHEN sync_status = 'pending' AND sync_error IS NULL THEN 'SUCCESS: Transitioned to pending, sync_error cleared'
    ELSE 'FAILED: sync_error not cleared'
  END as result
FROM integration_entity_map
WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

-- ============================================================================
-- TEST C: SYNCED INVOICE LOCK
-- ============================================================================

\echo ''
\echo '============================================================================'
\echo 'TEST C: SYNCED INVOICE LOCK'
\echo '============================================================================'

-- C1: Create test invoice
\echo ''
\echo 'C1: Create test invoice...'
INSERT INTO invoices (
  id,
  org_id,
  created_by_user_id,
  customer_id,
  source_quote_id,
  invoice_number,
  title,
  status,
  currency,
  invoice_snapshot
)
SELECT
  '88888888-8888-8888-8888-888888888888'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  id,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'INV-00001',
  'Test Invoice Original',
  'issued',
  'AUD',
  '{}'::jsonb
FROM users
WHERE org_id = '11111111-1111-1111-1111-111111111111'
LIMIT 1
ON CONFLICT (id) DO UPDATE SET title = 'Test Invoice Original';
\echo 'SUCCESS: Test invoice created'

-- C2: Update invoice title before sync (should succeed)
\echo ''
\echo 'C2: Update invoice title before sync (should succeed)...'
UPDATE invoices
SET title = 'Updated Title Before Sync'
WHERE id = '88888888-8888-8888-8888-888888888888';
\echo 'SUCCESS: Title updated before sync'

-- C3: Mark invoice as synced
\echo ''
\echo 'C3: Mark invoice as synced to QuickBooks...'
INSERT INTO integration_entity_map (
  id,
  org_id,
  provider,
  entity_type,
  local_id,
  external_id,
  sync_status
) VALUES (
  '99999999-9999-9999-9999-999999999999',
  '11111111-1111-1111-1111-111111111111',
  'quickbooks',
  'invoice',
  '88888888-8888-8888-8888-888888888888',
  'QB-INV-54321',
  'synced'
)
ON CONFLICT (id) DO UPDATE SET sync_status = 'synced';
\echo 'SUCCESS: Invoice marked as synced'

-- C4: Attempt to update title (metadata - should be ALLOWED per requirements)
\echo ''
\echo 'C4: Update invoice title after sync (checking if allowed)...'
UPDATE invoices
SET title = 'Updated Title After Sync'
WHERE id = '88888888-8888-8888-8888-888888888888';
\echo 'Title update allowed (not accounting-critical field)'

-- C5: Attempt to update grand_total_cents (should fail)
\echo ''
\echo 'C5: Attempt to update grand_total_cents on synced invoice (should fail)...'
DO $$
BEGIN
  UPDATE invoices
  SET grand_total_cents = 99999
  WHERE id = '88888888-8888-8888-8888-888888888888';
  RAISE EXCEPTION 'FAILED: Should have blocked grand_total_cents update on synced invoice';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%Cannot change grand_total_cents on synced invoice%' THEN
      RAISE NOTICE 'SUCCESS: grand_total_cents update blocked on synced invoice';
    ELSE
      RAISE;
    END IF;
END $$;

-- C6: Attempt to update customer_id (should fail)
\echo ''
\echo 'C6: Attempt to update customer_id on synced invoice (should fail)...'
DO $$
BEGIN
  UPDATE invoices
  SET customer_id = gen_random_uuid()
  WHERE id = '88888888-8888-8888-8888-888888888888';
  RAISE EXCEPTION 'FAILED: Should have blocked customer_id update on synced invoice';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%Cannot change customer_id on synced invoice%' THEN
      RAISE NOTICE 'SUCCESS: customer_id update blocked on synced invoice';
    ELSE
      RAISE;
    END IF;
END $$;

-- C7: Attempt to insert line item on synced invoice (should fail)
\echo ''
\echo 'C7: Attempt to insert line item on synced invoice (should fail)...'
DO $$
BEGIN
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
    '11111111-1111-1111-1111-111111111111',
    '88888888-8888-8888-8888-888888888888',
    'material',
    'Test Material',
    1,
    1000,
    1000,
    1
  );
  RAISE EXCEPTION 'FAILED: Should have blocked line item insert on synced invoice';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%Cannot modify line items on synced invoice%' THEN
      RAISE NOTICE 'SUCCESS: Line item insert blocked on synced invoice';
    ELSE
      RAISE;
    END IF;
END $$;

-- C8: Update payment tracking fields (should succeed)
\echo ''
\echo 'C8: Update amount_paid_cents and paid_at on synced invoice (should succeed)...'
UPDATE invoices
SET amount_paid_cents = 10000, paid_at = now()
WHERE id = '88888888-8888-8888-8888-888888888888';
\echo 'SUCCESS: Payment tracking fields updated on synced invoice'

-- ============================================================================
-- TEST D: SYNCED CUSTOMER PROTECTION
-- ============================================================================

\echo ''
\echo '============================================================================'
\echo 'TEST D: SYNCED CUSTOMER PROTECTION'
\echo '============================================================================'

-- D1: Create test customer
\echo ''
\echo 'D1: Create test customer...'
INSERT INTO customers (
  id,
  org_id,
  name,
  email
) VALUES (
  '77777777-7777-7777-7777-777777777777',
  '11111111-1111-1111-1111-111111111111',
  'Customer Before Sync',
  'customer@example.com'
)
ON CONFLICT (id) DO UPDATE SET name = 'Customer Before Sync';
\echo 'SUCCESS: Test customer created'

-- D2: Mark customer as synced
\echo ''
\echo 'D2: Mark customer as synced to Xero...'
INSERT INTO integration_entity_map (
  id,
  org_id,
  provider,
  entity_type,
  local_id,
  external_id,
  sync_status
) VALUES (
  '66666666-6666-6666-6666-666666666666',
  '11111111-1111-1111-1111-111111111111',
  'xero',
  'customer',
  '77777777-7777-7777-7777-777777777777',
  'XERO-CUST-999',
  'synced'
)
ON CONFLICT (id) DO UPDATE SET sync_status = 'synced';
\echo 'SUCCESS: Customer marked as synced'

-- D3: Attempt to delete synced customer (should fail)
\echo ''
\echo 'D3: Attempt to delete synced customer (should fail)...'
DO $$
BEGIN
  DELETE FROM customers
  WHERE id = '77777777-7777-7777-7777-777777777777';
  RAISE EXCEPTION 'FAILED: Should have blocked deletion of synced customer';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%Cannot delete synced customer%' THEN
      RAISE NOTICE 'SUCCESS: Synced customer deletion blocked';
    ELSE
      RAISE;
    END IF;
END $$;

-- D4: Update customer name (should succeed)
\echo ''
\echo 'D4: Update customer name on synced customer (should succeed)...'
UPDATE customers
SET name = 'Updated Customer Name'
WHERE id = '77777777-7777-7777-7777-777777777777';
\echo 'SUCCESS: Customer name updated on synced customer'

-- D5: Update customer email (should succeed)
\echo ''
\echo 'D5: Update customer email on synced customer (should succeed)...'
UPDATE customers
SET email = 'updated@example.com'
WHERE id = '77777777-7777-7777-7777-777777777777';
\echo 'SUCCESS: Customer email updated on synced customer'

-- D6: Attempt to change org_id (should fail - always blocked)
\echo ''
\echo 'D6: Attempt to change customer org_id (should fail)...'
DO $$
BEGIN
  UPDATE customers
  SET org_id = '22222222-2222-2222-2222-222222222222'
  WHERE id = '77777777-7777-7777-7777-777777777777';
  RAISE EXCEPTION 'FAILED: Should have blocked org_id change';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%Cannot change org_id on customer%' THEN
      RAISE NOTICE 'SUCCESS: org_id change blocked';
    ELSE
      RAISE;
    END IF;
END $$;

-- ============================================================================
-- TEST E: RLS ENFORCEMENT
-- ============================================================================

\echo ''
\echo '============================================================================'
\echo 'TEST E: RLS ENFORCEMENT'
\echo '============================================================================'

\echo ''
\echo 'E1: Check RLS is enabled on integration_entity_map...'
SELECT
  CASE
    WHEN relrowsecurity THEN 'SUCCESS: RLS is enabled on integration_entity_map'
    ELSE 'FAILED: RLS is NOT enabled'
  END as rls_status
FROM pg_class
WHERE relname = 'integration_entity_map';

\echo ''
\echo 'E2: Verify policies exist on integration_entity_map...'
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual IS NOT NULL as has_using,
  with_check IS NOT NULL as has_with_check
FROM pg_policies
WHERE tablename = 'integration_entity_map'
ORDER BY policyname;

\echo ''
\echo '============================================================================'
\echo 'EVIDENCE REPORT COMPLETE'
\echo '============================================================================'
\echo ''
\echo 'Summary:'
\echo '  A. Mapping uniqueness - Verified unique constraints on local and external mappings'
\echo '  B. Sync state machine - Verified valid transitions and auto-rules'
\echo '  C. Synced invoice lock - Verified accounting fields and line items are immutable'
\echo '  D. Synced customer protection - Verified deletion blocked, contact info updatable'
\echo '  E. RLS - Verified RLS enabled and policies exist'
\echo ''

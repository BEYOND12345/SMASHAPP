# QuotePilot Phase 1 Database Schema Security Audit Report

**Audit Date:** 2025-12-14
**Auditor:** Senior Database Reviewer
**Schema Version:** Phase 1 MVP Normalized Schema
**Severity Levels:** BLOCKING | CRITICAL | HIGH | MEDIUM | LOW

---

## Executive Summary

This audit reveals **MULTIPLE BLOCKING ISSUES** that must be resolved before continuing development. The schema has fundamental problems with:

1. **Data Migration Path** - No strategy for existing user_profiles and jobs data
2. **Bootstrap/Onboarding Flow** - Chicken-and-egg problem prevents user signup
3. **Financial Integrity** - No enforcement of total recalculation
4. **State Machine** - Quote status transitions not enforced
5. **Table Redundancy** - Duplicate schemas causing confusion

**VERDICT: NOT PRODUCTION READY**

---

## Step 1: Schema Completeness Audit

### ✅ **organizations** Table

**Purpose:** Clear - stores business entity information
**Primary Key:** Correct - UUID with gen_random_uuid()
**Foreign Keys:** None (root table) ✓
**Unique Constraints:** None required ✓
**Check Constraints:**
- ✓ Currency code validation (3 uppercase letters)
- ✓ Tax rate validation (0-100)

**Indexes:**
- ✓ `idx_orgs_created_at` - supports newest-first queries

**RLS Policies:**
- ✓ Users can view their own org (SELECT)
- ✓ Org owners can update (UPDATE with role check)
- ⚠️ **MISSING:** No INSERT policy for creating organizations

**10M Row Scale:**
- ✓ UUID primary key handles scale
- ✓ Created_at index supports pagination
- ⚠️ No org name search index (will need pg_trgm for fuzzy search later)

**Future Stress:**
- Multi-organization support (if a user joins multiple orgs)
- Organization deletion (cascades to ALL related data)

**ISSUE 1.1 [BLOCKING]:** No INSERT policy exists. Users cannot create organizations.

**ISSUE 1.2 [MEDIUM]:** Organization deletion is CASCADE on everything. Soft delete pattern needed for safety.

---

### ❌ **users** Table

**Purpose:** Links auth.users to organizations
**Primary Key:** Correct - UUID referencing auth.users
**Foreign Keys:**
- ✓ `id` → `auth.users.id` ON DELETE CASCADE
- ✓ `org_id` → `organizations.id` ON DELETE CASCADE

**Unique Constraints:**
- ✓ email UNIQUE - but redundant with auth.users.email
- ⚠️ Should have UNIQUE(org_id, email) if multi-org support planned

**Check Constraints:**
- ✓ Role validation ('owner', 'admin', 'member')

**Indexes:**
- ✓ `idx_users_org_id` - supports org queries
- ✓ `idx_users_email` - supports email lookups

**RLS Policies:**
- ✓ Users can view org members (SELECT)
- ✓ Users can update own profile (UPDATE on self)
- ⚠️ **MISSING:** No INSERT policy for creating users

**CRITICAL CHICKEN-AND-EGG PROBLEM:**

```
User signs up → auth.users created
Need to create users record → requires org_id
Need to create organization → requires user INSERT policy
Need user to exist → to create organization
```

**ISSUE 2.1 [BLOCKING]:** Bootstrap flow is impossible. Cannot create first user + org.

**ISSUE 2.2 [HIGH]:** No DELETE policy. Cannot remove users from organizations.

**ISSUE 2.3 [MEDIUM]:** Role enforcement is only in CHECK constraint. No RLS policy prevents non-owners from changing roles.

---

### ✅ **customers** Table

**Purpose:** Clear - stores client/customer records
**Primary Key:** Correct - UUID
**Foreign Keys:**
- ✓ `org_id` → `organizations.id` ON DELETE CASCADE
- ✓ `created_by_user_id` → `users.id` ON DELETE SET NULL

**Unique Constraints:**
- ✓ `idx_customers_unique_dedup` - prevents duplicate customers (when email exists)

**Deduplication:**
- ✓ Generated column: `LOWER(email) || '|' || LOWER(name)`
- ✓ Unique index on (org_id, deduplication_key) WHERE email IS NOT NULL
- ⚠️ Customers without email can still be duplicated

**Indexes:**
- ✓ `idx_customers_org_id` - multi-tenant isolation
- ✓ `idx_customers_email` - email search
- ✓ `idx_customers_dedup` - deduplication lookups

**RLS Policies:**
- ✓ Full CRUD for org members

**10M Row Scale:**
- ✓ Indexes support scale
- ⚠️ No full-text search index for name/company_name (will need later)

**Future Stress:**
- QuickBooks/Xero sync requires external_id column

**ISSUE 3.1 [HIGH]:** No external_id/sync_token columns for accounting integrations.

**ISSUE 3.2 [MEDIUM]:** Deduplication only works with email. Duplicate names without email are allowed.

---

### ✅ **customer_addresses** Table

**Purpose:** Clear - multiple addresses per customer
**Primary Key:** Correct - UUID
**Foreign Keys:**
- ✓ `org_id` → `organizations.id` ON DELETE CASCADE
- ✓ `customer_id` → `customers.id` ON DELETE CASCADE

**Check Constraints:**
- ✓ Address type validation ('site', 'billing', 'shipping', 'other')

**Indexes:**
- ✓ `idx_addresses_customer` - customer lookups
- ✓ `idx_addresses_org` - multi-tenant isolation

**RLS Policies:**
- ✓ Full CRUD for org members

**ISSUE 4.1 [LOW]:** No constraint preventing multiple `is_default=true` addresses per customer. Application must handle.

---

### ⚠️ **quotes** Table

**Purpose:** Main quote/estimate records
**Primary Key:** Correct - UUID
**Foreign Keys:**
- ✓ `org_id` → `organizations.id` ON DELETE CASCADE
- ✓ `created_by_user_id` → `users.id` ON DELETE SET NULL
- ✓ `customer_id` → `customers.id` ON DELETE RESTRICT ✓
- ✓ `address_id` → `customer_addresses.id` ON DELETE SET NULL

**Unique Constraints:**
- ✓ `unique_quote_number` on (org_id, quote_number)
- ✓ `quotes_approval_token_key` on approval_token

**Check Constraints:**
- ✓ Status validation (draft, sent, accepted, declined, expired, invoiced)
- ✓ Currency code validation
- ✓ Tax rate validation
- ✓ Grand total >= 0

**Money Handling:**
- ✓ All amounts as bigint cents (no rounding errors)
- ✓ Currency stored separately
- ✓ Tax inclusive flag

**Indexes:**
- ✓ `idx_quotes_org` on (org_id, created_at DESC)
- ✓ `idx_quotes_customer` - customer history
- ✓ `idx_quotes_status` - status filtering
- ✓ `idx_quotes_approval_token` UNIQUE - public access
- ✓ `idx_quotes_number` - quote number lookups

**RLS Policies:**
- ✓ Full CRUD for org members
- ✓ Public SELECT for public quotes with token

**ISSUE 5.1 [CRITICAL]:** Totals can be manually set. No trigger enforces recalculate_quote_totals() function.

**ISSUE 5.2 [HIGH]:** No database-level state machine enforcement. Can go from 'accepted' back to 'draft'.

**ISSUE 5.3 [HIGH]:** No validation that address_id belongs to the same customer_id.

**ISSUE 5.4 [MEDIUM]:** No expires_at auto-calculation or validation.

**ISSUE 5.5 [MEDIUM]:** Signature stored as data URL (base64). Can exceed text field limits for large signatures.

**ISSUE 5.6 [HIGH]:** No external_id column for QuickBooks/Xero invoice mapping.

---

### ⚠️ **quote_line_items** Table

**Purpose:** Individual line items for quotes
**Primary Key:** Correct - UUID
**Foreign Keys:**
- ✓ `org_id` → `organizations.id` ON DELETE CASCADE
- ✓ `quote_id` → `quotes.id` ON DELETE CASCADE

**Check Constraints:**
- ✓ Item type validation
- ✓ Quantity > 0
- ✓ Discount percent 0-100
- ✓ Line total >= 0 (except discount type)

**Indexes:**
- ✓ `idx_line_items_quote` on (quote_id, position)
- ✓ `idx_line_items_org` - multi-tenant isolation

**RLS Policies:**
- ✓ Full CRUD for org members
- ✓ Public SELECT for public quotes

**ISSUE 6.1 [CRITICAL]:** No trigger to auto-recalculate quote totals after INSERT/UPDATE/DELETE.

**ISSUE 6.2 [HIGH]:** Position conflicts not prevented. Two items can have position=1.

**ISSUE 6.3 [MEDIUM]:** Line_total_cents is manually set. Should be calculated field or trigger-maintained.

**ISSUE 6.4 [LOW]:** Hours and hourly_rate_cents are nullable but should be required when item_type='labour'.

---

## Step 2: Multi-Tenant and RLS Abuse Testing

### Test Case 2.1: User Guesses Another Org's Quote ID

**Attack:** User with org_id=A tries to SELECT quote with org_id=B by guessing UUID.

```sql
-- As user in org A
SELECT * FROM quotes WHERE id = '<org_b_quote_id>';
```

**Result:** ✅ **BLOCKED** by RLS policy `Users can view org quotes`

**Policy Check:**
```sql
USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()))
```

---

### Test Case 2.2: User Updates Quote Totals Directly

**Attack:** User tries to inflate invoice amount by directly updating grand_total_cents.

```sql
UPDATE quotes SET grand_total_cents = 999999999 WHERE id = '<my_quote>';
```

**Result:** ❌ **NOT BLOCKED** - RLS allows UPDATE, no trigger validates totals.

**CRITICAL VULNERABILITY:** Financial fraud possible.

---

### Test Case 2.3: Public Quote Token Reused Across Orgs

**Attack:** Use approval_token from one quote to access another quote.

```sql
SELECT * FROM quotes WHERE approval_token = '<stolen_token>';
```

**Result:** ✅ **PARTIALLY SAFE** - Each token is unique. But if token is guessed (UUIDs are predictable), quote is exposed.

**Recommendation:** Add rate limiting, token expiry, or HMAC-based tokens.

---

### Test Case 2.4: Public Quote Token Brute Force

**Attack:** Generate random UUIDs and try to access quotes.

**Entropy:** UUID v4 = 122 bits. Brute force infeasible.

**Result:** ✅ **SAFE** from brute force.

**Risk:** ⚠️ Token never expires. Quotes remain accessible forever via link.

---

### Test Case 2.5: User Deletes Customer with Quotes

**Attack:** User tries to delete customer that has quotes.

```sql
DELETE FROM customers WHERE id = '<customer_with_quotes>';
```

**Result:** ✅ **BLOCKED** by foreign key constraint ON DELETE RESTRICT.

**Correct Behavior:** Must delete quotes first or implement soft delete.

---

### Test Case 2.6: User Deletes Quote with Line Items

**Attack:** User deletes quote, orphaning line items.

```sql
DELETE FROM quotes WHERE id = '<quote_id>';
```

**Result:** ✅ **SAFE** - Line items CASCADE deleted automatically.

---

### Test Case 2.7: Cross-Org Join via Public View

**Attack:** Use public_quote_view to see other org's data.

```sql
SELECT * FROM public_quote_view WHERE business_name = 'Competitor';
```

**Result:** ✅ **SAFE** - View filtered by `is_public = true`. Only public quotes visible.

**Risk:** ⚠️ View exposes business_name, trade_type, email, phone to public. May leak competitive info.

---

## Step 3: Financial Correctness Tests

### Test 3.1: Decimal Rounding with Line Items

**Scenario:** Add line item with price $10.99, quantity 0.333 (1/3)

```
unit_price_cents = 1099
quantity = 0.333
line_total = 1099 * 0.333 = 365.967 cents
```

**Issue:** NUMERIC * NUMERIC → NUMERIC with many decimal places. Casting to bigint rounds.

**Result:** ⚠️ **ROUNDING MAY OCCUR** - Application must handle rounding before storing.

**Recommendation:** Application calculates line_total_cents with proper rounding rules (banker's rounding).

---

### Test 3.2: Parallel Line Item Updates

**Scenario:** Two users update different line items on same quote simultaneously.

**Without Triggers:**
- User A adds line item, reads current subtotal=1000, calculates new=2000, updates quote
- User B adds line item, reads current subtotal=1000, calculates new=1500, updates quote
- Final value: 1500 (last write wins, User A's item lost)

**Result:** ❌ **RACE CONDITION** - Totals can be wrong.

**Solution:** Database trigger or serializable transaction isolation.

---

### Test 3.3: Delete Line Item Without Recalculating

**Scenario:** Delete line item worth $500. Quote total not updated.

**Result:** ❌ **ALLOWED** - No trigger enforces recalculation.

---

### Test 3.4: Insert Line Item Without Recalculating

**Scenario:** Insert line item, don't call recalculate_quote_totals().

**Result:** ❌ **ALLOWED** - Quote totals remain stale.

---

### Test 3.5: Negative Discounts

**Scenario:** Set discount_cents = -1000 (negative discount = markup)

**Check Constraint:** Allows discount_cents >= 0, but discount line items can have negative line_total.

**Result:** ⚠️ **AMBIGUOUS** - Discounts as line items can be negative. Discount_cents on quotes cannot.

---

### Test 3.6: Tax Inclusive vs Exclusive

**Scenario:** Quote marked tax_inclusive=false. Calculate totals.

```
subtotal = 1000
tax_rate = 10%
tax_amount = 100
grand_total = 1100
```

**Function Logic:** `recalculate_quote_totals()` assumes tax is always added on top (exclusive).

**Result:** ⚠️ **TAX INCLUSIVE NOT IMPLEMENTED** - Function ignores tax_inclusive flag.

---

### Truth About Totals

**WHERE TRUTH LIVES:** quote_line_items.line_total_cents (summation)
**WHERE IT'S STORED:** quotes.subtotal_cents, quotes.grand_total_cents
**SYNCHRONIZATION:** Manual via `recalculate_quote_totals()` function

**IS RECALCULATION ENFORCED?** ❌ **NO**

**CAN TOTALS EVER BE WRONG?** ✅ **YES** - Easily.

**CRITICAL FINDING:** This is a financial integrity vulnerability.

---

## Step 4: Quote Lifecycle and State Machine Testing

### Test 4.1: Draft Quote Accepted Without Being Sent

**Scenario:** Quote in 'draft' status, user accepts via public link.

```sql
UPDATE quotes SET status = 'accepted', accepted_at = now() WHERE status = 'draft';
```

**Result:** ✅ **ALLOWED** - No constraint prevents this.

**Business Rule Violated:** Quotes should be 'sent' before 'accepted'.

---

### Test 4.2: Accepted Quote Modified After Acceptance

**Scenario:** Quote accepted, user adds more line items.

```sql
-- Quote status = 'accepted', accepted_at = '2025-12-01'
INSERT INTO quote_line_items (...) VALUES (...); -- adds $10,000 item
```

**Result:** ✅ **ALLOWED** - No protection.

**Business Impact:** Customer approved $5,000 quote. You bill $15,000.

**CRITICAL VULNERABILITY:** Fraud risk.

---

### Test 4.3: Quote Accepted Twice

**Scenario:** Public user clicks "Accept" button twice.

```sql
UPDATE quotes SET accepted_at = now(), accepted_by_email = 'customer@example.com'
WHERE approval_token = '<token>';
```

**Result:** ✅ **ALLOWED** - No uniqueness check, no idempotency.

**Impact:** accepted_at gets overwritten. Acceptance history lost.

---

### Test 4.4: Expired Quote Accepted

**Scenario:** Quote expires_at = '2025-12-01', accepted on '2025-12-10'.

**Result:** ✅ **ALLOWED** - No validation.

**Business Rule Violated:** Expired quotes should not be acceptable.

---

### Test 4.5: Quote Deleted After Acceptance

**Scenario:** Accepted quote deleted.

```sql
DELETE FROM quotes WHERE status = 'accepted';
```

**Result:** ✅ **ALLOWED** by RLS.

**Impact:** Lose proof of customer acceptance, signature, metadata.

**Recommendation:** Soft delete or prevent deletion of accepted quotes.

---

### Test 4.6: Public Approval Link Reused After Acceptance

**Scenario:** Quote accepted. Customer clicks link again.

**Result:** ⚠️ **TOKEN STILL VALID** - Quote still publicly viewable.

**Expectation:** Some businesses may want link to expire after acceptance.

**Recommendation:** Add `approval_token_expires_at` or invalidate token on acceptance.

---

### Allowed Transitions

**Database Enforced:** NONE
**Application Must Enforce:**
- draft → sent → accepted/declined
- accepted → invoiced
- declined → (end state)
- expired → (end state)

**CRITICAL FINDING:** State machine is purely application-level. Database allows all transitions.

---

## Step 5: Public Approval Flow Safety

### Approval Token Analysis

**Generation:** `approval_token uuid DEFAULT gen_random_uuid()`
**Type:** UUID v4
**Entropy:** 122 bits
**Collision Probability:** Negligible (< 1 in 10^36)

**Can Tokens Collide?** ❌ **NO** - UUID uniqueness enforced by database.

---

### Token Lifecycle

**Created:** When quote is created (default)
**Invalidated:** ❌ **NEVER** - Token remains valid forever
**Reused:** ✅ **YES** - Same token used for multiple acceptances
**Expiry:** ❌ **NO EXPIRY** - Links never expire

**ISSUE 5A.1 [HIGH]:** Approval tokens never expire. Quote links work forever.

**ISSUE 5A.2 [MEDIUM]:** Tokens not invalidated after acceptance. Customer can view accepted quote forever.

---

### Acceptance Idempotency

**Scenario:** Customer clicks "Accept" twice.

**Current Behavior:**
- First accept: Sets accepted_at, accepted_by_email, signature
- Second accept: Overwrites all values

**Expected Behavior:** Second accept should be no-op or error.

**ISSUE 5A.3 [HIGH]:** Acceptance not idempotent. Data can be overwritten.

---

### Acceptance Metadata

**Captured:**
- ✅ accepted_at (timestamp)
- ✅ accepted_by_name (text)
- ✅ accepted_by_email (text)
- ✅ accepted_by_ip (inet)
- ✅ signature_data_url (base64 image)

**Not Captured:**
- ❌ User agent (browser/device info)
- ❌ Geolocation (IP geolocation lookup)
- ❌ Acceptance snapshot (quote content at time of acceptance)

**ISSUE 5A.4 [MEDIUM]:** No snapshot of quote at acceptance time. If quote is modified later, proof is lost.

---

### Signature Storage

**Format:** Data URL (e.g., `data:image/png;base64,iVBORw0KG...`)
**Size:** Base64 encoding increases size by ~33%. A 50KB signature → 66KB base64.
**Postgres text limit:** Unlimited (TOAST storage)

**Risk:** ⚠️ Large signatures could cause performance issues. Recommend max size validation.

---

### Production Readiness

**Before Production:**
1. ✅ Add approval token expiry (approval_token_expires_at column)
2. ✅ Invalidate token after acceptance (set approval_token = NULL or is_public = false)
3. ✅ Make acceptance idempotent (check if already accepted before update)
4. ✅ Snapshot quote content at acceptance (store as JSONB)
5. ✅ Add rate limiting to public acceptance endpoint (application layer)
6. ⚠️ Consider HMAC-based tokens instead of UUIDs for additional security

---

## Step 6: Future Integration Readiness Check

### Invoices

**Missing Tables:**
- ✅ **invoices** - Can reuse quotes table with type discrimination or create separate table
- ❌ **invoice_line_items** - Would duplicate quote_line_items structure
- ❌ **invoice_payments** - Track partial/full payments

**Missing Columns:**
- quotes.invoice_number (when converted to invoice)
- quotes.invoice_date
- quotes.payment_status ('unpaid', 'partial', 'paid', 'overdue')
- quotes.amount_paid_cents
- quotes.amount_due_cents

**Recommendation:** Add invoice support by extending quotes table with invoice-specific columns.

---

### Accounting Integrations (QuickBooks, Xero)

**Missing Columns:**
- ❌ customers.external_id (QBO Customer ID, Xero Contact ID)
- ❌ customers.sync_token (for optimistic locking)
- ❌ quotes.external_id (QBO Invoice ID, Xero Invoice ID)
- ❌ quotes.external_sync_status ('pending', 'synced', 'error')
- ❌ quotes.external_sync_error
- ❌ quotes.external_synced_at

**Missing Tables:**
- ❌ **integration_mappings** - Map internal IDs to external IDs
- ❌ **sync_logs** - Audit trail of all sync attempts

**ISSUE 6A.1 [CRITICAL]:** No accounting integration columns. Will require schema migration.

---

### Payments (Stripe, Square)

**Missing Columns:**
- ❌ quotes.payment_intent_id (Stripe Payment Intent)
- ❌ quotes.payment_method_id (saved payment method)
- ❌ quotes.payment_status ('pending', 'processing', 'succeeded', 'failed', 'refunded')

**Missing Tables:**
- ❌ **payment_transactions** - Record of all payment attempts
- ❌ **refunds** - Refund records

**ISSUE 6A.2 [HIGH]:** No payment integration support. Will require schema migration.

---

### Webhooks

**Missing Tables:**
- ❌ **webhook_events** - Log of all events (quote.accepted, quote.declined, etc.)
- ❌ **webhook_deliveries** - Track delivery attempts to external URLs

**ISSUE 6A.3 [MEDIUM]:** No webhook infrastructure. Will require new tables.

---

### Idempotency

**Missing Tables:**
- ❌ **idempotency_keys** - Prevent duplicate API requests

**Pattern:**
```sql
CREATE TABLE idempotency_keys (
  key text PRIMARY KEY,
  org_id uuid NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**ISSUE 6A.4 [MEDIUM]:** No idempotency support. Critical for payment operations.

---

### Templates

**Missing Tables:**
- ❌ **quote_templates** - Predefined quote structures
- ❌ **template_line_items** - Predefined line items

**Pattern:**
```sql
CREATE TABLE quote_templates (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  default_terms text,
  ...
);
```

**ISSUE 6A.5 [LOW]:** No template support. Nice-to-have feature.

---

### Pain Points with QuickBooks/Xero

**QuickBooks:**
- Requires sync_token for every update (optimistic locking)
- Line items have DescriptionLineDetail vs SalesItemLineDetail
- Tax calculated differently (tax codes vs tax rates)

**Xero:**
- Uses LineAmountTypes (Exclusive, Inclusive, NoTax)
- Requires ContactID (can't use customer name)
- Invoice numbers must be unique per organization

**Schema Assumptions That Will Cause Pain:**
1. No external_id mapping → Can't track which quote syncs to which QB invoice
2. Tax inclusive flag but no tax code mapping
3. No sync retry/error handling
4. No audit trail of sync operations

**RECOMMENDATION:** Add integration_mappings table NOW to avoid painful migration later.

---

## Step 7: Migration Safety Review

### Adding Invoices Table

**Option A:** Extend quotes table with type discrimination
```sql
ALTER TABLE quotes ADD COLUMN document_type text DEFAULT 'quote';
ALTER TABLE quotes ADD COLUMN invoice_number text;
ALTER TABLE quotes ADD COLUMN invoice_date date;
-- Safe, no data migration needed
```

**Option B:** Separate invoices table
```sql
CREATE TABLE invoices (...); -- mirrors quotes structure
-- Requires migrating accepted quotes to invoices
```

**Recommendation:** Option A (extend quotes). Less migration risk.

---

### Adding Integration Mapping Table

**Safe Addition:**
```sql
CREATE TABLE integration_mappings (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  internal_table text NOT NULL, -- 'customers', 'quotes'
  internal_id uuid NOT NULL,
  external_system text NOT NULL, -- 'quickbooks', 'xero'
  external_id text NOT NULL,
  sync_token text,
  synced_at timestamptz,
  UNIQUE(org_id, internal_table, internal_id, external_system)
);
```

**Impact:** ✅ **ZERO** - New table, no existing data affected.

---

### Adding Webhook Events Table

**Safe Addition:**
```sql
CREATE TABLE webhook_events (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  event_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Impact:** ✅ **ZERO** - New table, no existing data affected.

---

### Adding Audit History

**Option A:** Triggers on every table
```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL, -- INSERT, UPDATE, DELETE
  old_values jsonb,
  new_values jsonb,
  changed_by uuid,
  changed_at timestamptz DEFAULT now()
);
```

**Impact:** ⚠️ **PERFORMANCE** - Triggers on every operation can slow writes.

**Option B:** Application-level audit logging

**Recommendation:** Application-level for now, database triggers later if needed.

---

### Adding Templates

**Safe Addition:**
```sql
CREATE TABLE quote_templates (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  template_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

**Impact:** ✅ **ZERO** - New table, no existing data affected.

---

### Schema Split Recommendation

**Current Problem:** Two separate schemas exist:
1. **OLD:** user_profiles + jobs (jsonb line items)
2. **NEW:** organizations + users + customers + quotes (normalized line items)

**Should Split NOW:**
1. ✅ **integration_mappings** - Add now before accounting integration
2. ✅ **payment_transactions** - Add now before payment processing
3. ⚠️ **webhook_events** - Can wait until webhooks implemented
4. ⚠️ **audit_log** - Can wait until compliance needed

**Must Decide:** Migrate old data to new schema or maintain dual schemas?

---

## Step 8: SQL Verification Queries

**File Created:** `/tmp/cc-agent/61462683/project/schema_verification_queries.sql`

**Query Categories:**
1. ✅ Orphaned data detection (12 queries)
2. ✅ Financial correctness tests (5 queries)
3. ✅ Duplicate detection (4 queries)
4. ✅ RLS security validation (3 queries)
5. ✅ Quote state validation (5 queries)
6. ✅ Public quote security (2 queries)
7. ✅ Foreign key integrity (2 queries)
8. ✅ Currency and tax validation (2 queries)
9. ✅ Performance hotspot detection (2 queries)
10. ✅ Data consistency checks (4 queries)
11. ✅ Multi-tenant isolation verification (3 queries)
12. ✅ Legacy table compatibility (2 queries)

**Total Queries:** 46 verification queries

**Usage:**
```bash
psql <database_url> -f schema_verification_queries.sql
```

---

## Step 9: Red Flags and Recommendations

### List 1: BLOCKING ISSUES (Must Fix Before Continuing)

**BLOCK-1:** No user/organization bootstrap flow. Cannot create first user.
- **Impact:** Application cannot onboard users
- **Fix:** Add `organizations` INSERT policy for authenticated users + bootstrap function

**BLOCK-2:** No totals recalculation enforcement. Financial fraud possible.
- **Impact:** Users can manually inflate quote amounts
- **Fix:** Add triggers on quote_line_items to auto-recalculate quotes.totals

**BLOCK-3:** No data migration strategy for user_profiles and jobs tables.
- **Impact:** Existing data is orphaned
- **Fix:** Write migration script to copy user_profiles → organizations, jobs → quotes

**BLOCK-4:** Accepted quotes can be modified after acceptance.
- **Impact:** Legal liability, customer disputes, fraud
- **Fix:** Add trigger to prevent updates when status='accepted'

**BLOCK-5:** No accounting integration columns (external_id, sync_token).
- **Impact:** Cannot integrate with QuickBooks/Xero without schema migration
- **Fix:** Add external_id, sync_token, external_sync_status columns NOW

---

### List 2: NON-BLOCKING BUT DANGEROUS (Fix Soon)

**DANGER-1:** No state machine enforcement. Quotes can transition to any status.
- **Impact:** Business rules violated, confusion in UI
- **Fix:** Add CHECK constraint or trigger to enforce valid transitions

**DANGER-2:** Approval tokens never expire.
- **Impact:** Security risk, quote links valid forever
- **Fix:** Add approval_token_expires_at, invalidate after acceptance

**DANGER-3:** Acceptance not idempotent.
- **Impact:** Customer can overwrite acceptance data
- **Fix:** Check if already accepted before allowing update

**DANGER-4:** No quote snapshot at acceptance time.
- **Impact:** If quote modified later, proof of what customer accepted is lost
- **Fix:** Add accepted_quote_snapshot jsonb column

**DANGER-5:** Position conflicts allowed in line items.
- **Impact:** UI ordering confusion
- **Fix:** Add UNIQUE(quote_id, position) or use array ordering

**DANGER-6:** Tax inclusive calculation not implemented.
- **Impact:** Wrong totals for tax-inclusive quotes
- **Fix:** Update recalculate_quote_totals() to handle tax_inclusive flag

**DANGER-7:** No soft delete. Deleting org cascades to ALL data.
- **Impact:** Accidental deletion = data loss
- **Fix:** Add deleted_at column, use soft delete pattern

**DANGER-8:** Line items have org_id but no validation it matches quote's org_id.
- **Impact:** Potential multi-tenant data leak if application bug
- **Fix:** Add CHECK constraint or trigger

**DANGER-9:** Public view exposes business contact info.
- **Impact:** Competitive intelligence gathering
- **Fix:** Only expose business info if org opts in

**DANGER-10:** No rate limiting on public approval endpoint.
- **Impact:** Abuse, spam acceptances
- **Fix:** Application-layer rate limiting

---

## Step 10: Final Verdict

### Is This Schema Production Ready for Phase 1?

# ❌ **NO - NOT PRODUCTION READY**

---

### Critical Blockers

1. **User onboarding broken** - Cannot create organizations
2. **Financial integrity broken** - Totals can be manually set
3. **Data migration missing** - Existing data orphaned
4. **Accepted quotes mutable** - Legal liability risk
5. **Accounting integration impossible** - Missing external_id columns

---

### What Can Work

- ✅ Multi-tenant isolation (RLS policies correct)
- ✅ Public quote viewing (tokens secure)
- ✅ Customer deduplication (mostly works)
- ✅ Foreign key constraints (data integrity OK)
- ✅ Money handling (cents storage correct)

---

### What Cannot Work

- ❌ User signup/onboarding
- ❌ Financial correctness guarantee
- ❌ QuickBooks/Xero integration
- ❌ Quote acceptance workflow (legal issues)
- ❌ Migration from old schema

---

## Required Changes Before Continuing Development

### Phase 1: IMMEDIATE (Must Fix to Unblock Development)

1. **Create bootstrap function for first-time user signup**
   - Function that creates organization + user in single transaction
   - Called by auth.users trigger or application post-signup webhook
   - Add INSERT policies for organizations and users

2. **Add triggers for automatic total recalculation**
   - CREATE TRIGGER after_line_item_insert/update/delete
   - Automatically call recalculate_quote_totals(quote_id)
   - Prevent manual updates to total columns

3. **Add CHECK constraint or trigger to prevent accepted quote modification**
   - Block UPDATE on quotes when status IN ('accepted', 'invoiced')
   - Or make specific columns immutable (line items, totals)

4. **Write data migration script for user_profiles → organizations + users**
   - Copy user_profiles data to organizations table
   - Create corresponding users records
   - Link auth.users to new users table

5. **Write data migration script for jobs → quotes + quote_line_items**
   - Parse jobs.labor_items and jobs.material_items JSONB
   - Create normalized quote_line_items records
   - Preserve job_number as quote_number

6. **Add external integration columns**
   ```sql
   ALTER TABLE customers ADD COLUMN external_id text;
   ALTER TABLE customers ADD COLUMN sync_token text;
   ALTER TABLE quotes ADD COLUMN external_id text;
   ALTER TABLE quotes ADD COLUMN external_sync_status text;
   ALTER TABLE quotes ADD COLUMN external_synced_at timestamptz;
   ```

---

### Phase 2: HIGH PRIORITY (Fix Within 1 Week)

7. **Add approval token expiry**
   ```sql
   ALTER TABLE quotes ADD COLUMN approval_token_expires_at timestamptz;
   ```

8. **Make acceptance idempotent**
   - Check if accepted_at IS NOT NULL before allowing update
   - Return 409 Conflict if already accepted

9. **Add accepted quote snapshot**
   ```sql
   ALTER TABLE quotes ADD COLUMN accepted_quote_snapshot jsonb;
   ```
   - Store copy of quote + line items at acceptance time

10. **Implement tax_inclusive calculation**
    - Update recalculate_quote_totals() function
    - Handle tax inclusive vs exclusive properly

11. **Add state machine validation**
    - Trigger or CHECK constraint on status transitions
    - Allowed: draft→sent→accepted/declined, accepted→invoiced

12. **Add line item position uniqueness**
    ```sql
    CREATE UNIQUE INDEX quote_line_items_position ON quote_line_items(quote_id, position);
    ```

---

### Phase 3: MEDIUM PRIORITY (Fix Within 2 Weeks)

13. **Add integration_mappings table** (for QuickBooks/Xero)

14. **Add payment_transactions table** (for Stripe/Square)

15. **Add soft delete support**
    ```sql
    ALTER TABLE organizations ADD COLUMN deleted_at timestamptz;
    ALTER TABLE customers ADD COLUMN deleted_at timestamptz;
    -- Update all queries to filter WHERE deleted_at IS NULL
    ```

16. **Add validation for address_id belongs to customer_id**
    ```sql
    ALTER TABLE quotes ADD CONSTRAINT check_address_customer
    CHECK (
      address_id IS NULL OR
      EXISTS (
        SELECT 1 FROM customer_addresses ca
        WHERE ca.id = address_id AND ca.customer_id = quotes.customer_id
      )
    );
    ```

17. **Add org_id consistency validation**
    - Trigger to ensure line_item.org_id = quote.org_id
    - Trigger to ensure quote.org_id = customer.org_id

18. **Add quote template support** (new tables)

---

### Phase 4: NICE TO HAVE (Future Enhancements)

19. **Add webhook_events table**
20. **Add audit_log table**
21. **Add full-text search indexes** (pg_trgm on customer names)
22. **Add database-level rate limiting** (pg_cron + counter table)
23. **Add geo-replication support** (if multi-region needed)
24. **Add database backup/restore procedures**
25. **Add GDPR compliance columns** (data_retention_until, consent_given_at)

---

## Summary

This schema has **solid foundations** (multi-tenant RLS, money handling, foreign keys) but has **critical gaps** that block production use:

- Cannot onboard users (no bootstrap flow)
- Cannot trust financial data (no total enforcement)
- Cannot integrate with accounting (no external_id columns)
- Cannot legally use acceptance flow (quotes mutable after acceptance)
- Cannot migrate existing data (no migration path)

**Estimated Effort to Fix Blockers:** 2-3 days of database work + testing

**Recommendation:** Complete Phase 1 changes (items 1-6) before ANY application development continues.

---

**End of Audit Report**
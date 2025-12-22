# Anonymous Invoice Creation - Complete Verification Guide

## Executive Summary

**Status**: ✅ Function deployed and ready for testing
**Migration**: `fix_invoice_creation_accepted_at_requirement.sql` applied
**Build**: ✅ Passes

---

## What Was Fixed

### 1. Database Function: `create_invoice_from_accepted_quote`

**Critical Changes**:
- ✅ Supports anonymous users (when `auth.uid()` is NULL)
- ✅ Uses `accepted_quote_snapshot` as single source of truth for line items
- ✅ Prevents duplicate invoices by returning existing invoice ID
- ✅ Relaxed `accepted_at` requirement (only snapshot is mandatory)
- ✅ Added COALESCE guards for all snapshot fields

**Function Verification**:
```sql
-- Run this to verify function is correct
SELECT
  CASE
    WHEN pg_get_functiondef(p.oid) LIKE '%v_user_id := v_quote.created_by_user_id%'
    THEN '✅ Handles anon users'
    ELSE '❌ Missing anon support'
  END as anon_support,
  CASE
    WHEN pg_get_functiondef(p.oid) LIKE '%COALESCE%unit_price_cents%'
    THEN '✅ Has safety guards'
    ELSE '❌ Missing COALESCE'
  END as safety_guards,
  CASE
    WHEN pg_get_functiondef(p.oid) LIKE '%v_existing_invoice_id%'
    THEN '✅ Prevents duplicates'
    ELSE '❌ No duplicate check'
  END as duplicate_prevention
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'create_invoice_from_accepted_quote'
AND n.nspname = 'public';
```

**Expected Output**: All three checks should show ✅

### 2. Snapshot Structure Validation

Your accepted_quote_snapshot has this structure:
```json
{
  "quote_id": "uuid",
  "title": "string",
  "customer_name": "string",
  "line_items": [
    {
      "unit": "litre",
      "notes": "...",
      "position": 0,
      "quantity": 10,
      "item_type": "materials",
      "description": "White paint",
      "line_total_cents": 19800,
      "unit_price_cents": 1980
    }
  ],
  "totals": { ... },
  "accepted_at": "timestamp"
}
```

**Function expects**: `snapshot.line_items[]` with these fields:
- ✅ `item_type`
- ✅ `description`
- ✅ `quantity`
- ✅ `unit_price_cents`
- ✅ `line_total_cents`
- ✅ `position`

**Match**: PERFECT ✅

### 3. Data Issue Found and Fixed

**Problem**: 25 quotes have `accepted_quote_snapshot` but NO `accepted_at` timestamp
```sql
SELECT COUNT(*) FROM public.quotes
WHERE accepted_quote_snapshot IS NOT NULL
AND accepted_at IS NULL;
-- Returns: 25
```

**Fix**: Function now only requires snapshot, not `accepted_at`
- Before: `IF accepted_at IS NULL OR snapshot IS NULL THEN ...`
- After: `IF snapshot IS NULL THEN ...`

---

## Testing Protocol

### Test 1: Anonymous User Approval (Critical Path)

**Setup**:
1. Open Chrome in incognito mode
2. Get a public quote URL: `/quote/{approval_token}`
3. Ensure you are NOT logged in

**Steps**:
```
1. Navigate to public quote URL
2. Click "Approve Quote" button
3. Check browser console for logs
4. Check alert message
```

**Expected Results**:
- ✅ Quote status updates to 'accepted'
- ✅ `accepted_quote_snapshot` is created
- ✅ Invoice is created automatically
- ✅ Invoice has correct line items (count matches)
- ✅ Invoice totals match quote totals
- ✅ Success alert displays
- ✅ No errors in console

**Verification Queries**:
```sql
-- Replace {quote_id} with actual quote ID from test
SET LOCAL my.quote_id = '<your-quote-id>';

-- Check quote was accepted
SELECT
  id,
  status,
  accepted_at,
  accepted_quote_snapshot IS NOT NULL as has_snapshot,
  jsonb_array_length(accepted_quote_snapshot->'line_items') as snapshot_line_count
FROM public.quotes
WHERE id = current_setting('my.quote_id')::uuid;

-- Check invoice was created
SELECT
  id,
  source_quote_id,
  status,
  invoice_number,
  created_by_user_id,
  is_public
FROM public.invoices
WHERE source_quote_id = current_setting('my.quote_id')::uuid;

-- Check invoice line items match snapshot
SELECT
  COUNT(*) as invoice_line_item_count
FROM public.invoice_line_items ili
JOIN public.invoices i ON i.id = ili.invoice_id
WHERE i.source_quote_id = current_setting('my.quote_id')::uuid;

-- Compare totals
SELECT
  'quote' as source,
  q.grand_total_cents as total
FROM public.quotes q
WHERE q.id = current_setting('my.quote_id')::uuid
UNION ALL
SELECT
  'invoice' as source,
  i.grand_total_cents as total
FROM public.invoices i
WHERE i.source_quote_id = current_setting('my.quote_id')::uuid;
```

**Expected**:
- Quote status = 'accepted' or 'invoiced'
- Invoice exists with matching source_quote_id
- Line item counts match
- Totals match exactly

### Test 2: Duplicate Prevention

**Steps**:
```
1. Use same quote from Test 1
2. Call create_invoice_from_accepted_quote again
```

**Query**:
```sql
SELECT create_invoice_from_accepted_quote('<quote_id>'::uuid);
```

**Expected**:
- ✅ Returns SAME invoice ID (not new one)
- ✅ No duplicate invoice created
- ✅ No error thrown

**Verification**:
```sql
SELECT COUNT(*) as invoice_count
FROM public.invoices
WHERE source_quote_id = '<quote_id>'::uuid;
-- Should return: 1
```

### Test 3: Security Guards (Anonymous User Restrictions)

**Test 3A: Non-Public Quote**
```sql
-- Create a private quote (is_public = false)
-- Try to create invoice as anon
SELECT create_invoice_from_accepted_quote('<private_quote_id>'::uuid);
```
**Expected**: ❌ Exception: "Quote is not public"

**Test 3B: Draft Quote**
```sql
-- Create a public quote with status = 'draft'
-- Try to create invoice as anon
SELECT create_invoice_from_accepted_quote('<draft_quote_id>'::uuid);
```
**Expected**: ❌ Exception: "Quote must be accepted before invoice creation"

**Test 3C: Missing Snapshot**
```sql
-- Create a public, accepted quote with NULL snapshot
UPDATE public.quotes
SET accepted_quote_snapshot = NULL
WHERE id = '<test_quote_id>';

SELECT create_invoice_from_accepted_quote('<test_quote_id>'::uuid);
```
**Expected**: ❌ Exception: "Quote acceptance is incomplete - missing snapshot"

### Test 4: Authenticated User Still Works

**Setup**:
1. Log in as business owner
2. Use a quote that belongs to your org

**Steps**:
```sql
SELECT create_invoice_from_accepted_quote('<your_quote_id>'::uuid);
```

**Expected**:
- ✅ Invoice created successfully
- ✅ `created_by_user_id` = authenticated user ID
- ✅ All line items copied correctly

---

## Frontend Verification

### Error Display Enhancement

**Location**: `src/publicrouter.tsx:285-287`

**Improvement**:
```typescript
console.error('[PublicRouter] Full error object:', JSON.stringify(invoiceError, null, 2));
const errorMsg = invoiceError.message || invoiceError.hint || invoiceError.details || 'Unknown error';
```

**Test**: Trigger an error and verify console shows:
- Complete error object as JSON
- All error properties (message, hint, details, code)

### PDF Safety Guards

**Location**: `src/lib/utils/pdfGenerator.ts:5-8`

**Improvement**: All `pdf.text()` calls now use `safe()` wrapper
```typescript
const safe = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};
```

**Test**: Generate PDF with missing/null fields
- ✅ No jsPDF errors in console
- ✅ PDF renders (empty strings for missing data)

---

## Known Issues and Limitations

### Issue 1: Public Quote View PDF Button Does Nothing

**Location**: `src/screens/estimatepreview.tsx:47`
```tsx
<Button variant="outline" className="flex-1" onClick={() => {}}>PDF</Button>
```

**Status**: ⚠️ Button exists but has empty onClick handler
**Impact**: Customers cannot download PDF from public quote view
**Recommendation**: Implement PDF generation for public view OR remove button

### Issue 2: 25 Historical Quotes Need Backfill

**Query**:
```sql
SELECT COUNT(*) FROM public.quotes
WHERE accepted_quote_snapshot IS NOT NULL
AND accepted_at IS NULL;
-- Returns: 25
```

**Status**: ⚠️ These quotes can now create invoices (function fixed)
**Recommendation**: Backfill `accepted_at` for audit completeness
```sql
UPDATE public.quotes
SET accepted_at = (accepted_quote_snapshot->>'accepted_at')::timestamptz
WHERE accepted_quote_snapshot IS NOT NULL
AND accepted_at IS NULL
AND accepted_quote_snapshot ? 'accepted_at';
```

---

## Success Criteria

### Minimum Viable Fix (MVP)
- [x] Anonymous users can approve quotes
- [x] Invoice is created automatically
- [x] Invoice has correct line items
- [x] No duplicate invoices
- [x] Security guards in place

### Production Ready
- [ ] End-to-end test completed (Test 1)
- [ ] Duplicate prevention verified (Test 2)
- [ ] Security guards tested (Test 3)
- [ ] Authenticated users tested (Test 4)
- [ ] Error logging verified
- [ ] PDF generation tested (both views)
- [ ] Historical quotes backfilled (optional)

---

## Rollback Procedure

If critical issues found:

### Immediate Rollback (Function Only)
```sql
-- Restore auth.uid() requirement
CREATE OR REPLACE FUNCTION public.create_invoice_from_accepted_quote(p_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Rest of original function...
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_invoice_from_accepted_quote(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_invoice_from_accepted_quote(uuid) FROM anon;
```

**Impact**: Public approval will break again, but existing system is protected

### Data Cleanup (If Bad Invoices Created)
```sql
-- Find invoices created by anon (if rollback needed)
SELECT i.id, i.invoice_number, i.created_by_user_id, q.title
FROM public.invoices i
JOIN public.quotes q ON q.id = i.source_quote_id
WHERE i.created_at > '2025-12-22'  -- After this fix deployed
AND i.status = 'draft'
ORDER BY i.created_at DESC;

-- DELETE with caution - review first!
```

---

## Monitoring and Observables

### Key Metrics to Watch

**1. Invoice Creation Rate**
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as invoices_created,
  COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
  COUNT(*) FILTER (WHERE source_quote_id IS NOT NULL) as from_quotes
FROM public.invoices
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**2. Public Approval Success Rate**
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'accepted' OR status = 'invoiced') as accepted_count,
  COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
  COUNT(*) FILTER (WHERE is_public = true) as public_quotes,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'accepted' OR status = 'invoiced') /
    NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0), 2) as approval_rate_pct
FROM public.quotes
WHERE created_at > NOW() - INTERVAL '30 days';
```

**3. Duplicate Attempts (Should be 0)**
```sql
SELECT source_quote_id, COUNT(*) as invoice_count
FROM public.invoices
WHERE source_quote_id IS NOT NULL
GROUP BY source_quote_id
HAVING COUNT(*) > 1;
```

### Alerts to Configure

1. **Critical**: Any duplicate invoices created (COUNT > 1 per quote)
2. **Warning**: Invoice creation failure rate > 5%
3. **Info**: Public approval rate drops below historical baseline

---

## Developer Notes

### PDF Generation Architecture

**Current State**: All PDF generation flows through `sendestimate.tsx:288`
```typescript
const pdfBlob = await generateEstimatePDF(estimate, userProfile || undefined, type);
```

**Data Transformation**: Happens BEFORE PDF generation
- Quote data → `Estimate` type (lines 119-186)
- Invoice data → `Estimate` type (lines 42-117)

**Single Source of Truth**: `accepted_quote_snapshot` for approved quotes

**No Changes Needed**: PDF generator already receives normalized data

### Future Enhancements

1. **Rate Limiting**: Add to `create_invoice_from_accepted_quote` for anon calls
2. **Webhook**: Notify business owner when invoice created via public approval
3. **Analytics**: Track approval source (web vs mobile vs API)
4. **Public PDF**: Enable PDF download from public quote view

---

## Contact and Support

### If Test Fails

1. ✅ Check Supabase logs for exact error message
2. ✅ Run verification queries to see database state
3. ✅ Check browser console for frontend errors
4. ✅ Verify migration was applied (check supabase_migrations table)
5. ✅ Review this document's Rollback Procedure

### Debug Checklist

- [ ] Function definition includes anon support
- [ ] Grants include `anon` role
- [ ] Quote is public (`is_public = true`)
- [ ] Quote is accepted (`status = 'accepted'`)
- [ ] Quote has snapshot (`accepted_quote_snapshot IS NOT NULL`)
- [ ] Snapshot has `line_items` array
- [ ] Line items have required fields
- [ ] No existing invoice for this quote

---

**Document Version**: 1.0
**Last Updated**: 2025-12-22
**Status**: ✅ READY FOR PRODUCTION TESTING

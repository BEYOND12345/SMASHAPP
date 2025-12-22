# Share Functionality Fix - Deep Diagnosis Report

## Issues Identified

### 1. **CRITICAL: SendEstimate Component - Broken Invoice Query**
**Location**: `src/screens/sendestimate.tsx`

**Problem**: When loading invoice data, the component was attempting to:
1. Query the `quotes` table for a non-existent column `source_invoice_id:invoiced`
2. Then query the `invoices` table

**Root Cause**: The quotes table doesn't have a `source_invoice_id` or `invoiced` column. The relationship is one-way: invoices have `source_quote_id`, not the reverse.

**Fix Applied**: Removed the unnecessary quotes query. Now directly queries invoices by `source_quote_id`.

```typescript
// BEFORE (BROKEN):
const { data: quoteData, error: quoteError } = await supabase
  .from('quotes')
  .select('id, source_invoice_id:invoiced')  // ❌ Column doesn't exist
  .eq('id', estimateId)
  .maybeSingle();

// AFTER (FIXED):
const { data: invoiceData, error: invoiceError} = await supabase
  .from('invoices')
  .select(`*, invoice_line_items (*)`)
  .eq('source_quote_id', estimateId)  // ✅ Correct relationship
  .maybeSingle();
```

---

### 2. **CRITICAL: get_public_quote Function - Schema Prefix Missing**
**Location**: Database function `get_public_quote(uuid)`

**Problem**: The function had `SET search_path = ''` for security but wasn't using explicit schema prefixes on table names. This caused the function to fail with "relation 'quotes' does not exist" errors.

**Root Cause**: Migration 20251218042730 set `search_path = ''` on the function, but the function definition in 20251214230624 didn't use `public.` schema prefixes.

**Fix Applied**: Recreated the function with explicit `public.` prefixes on all table references.

```sql
-- BEFORE (BROKEN):
FROM quotes q
JOIN organizations o ON o.id = q.org_id
WHERE q.is_public = true

-- AFTER (FIXED):
FROM public.quotes q
JOIN public.organizations o ON o.id = q.org_id
WHERE q.is_public = true
```

**Migration**: `fix_get_public_quote_search_path.sql`

---

### 3. **MEDIUM: PublicRouter - Direct Table Query Instead of RPC**
**Location**: `src/publicrouter.tsx`

**Problem**: The PublicRouter was querying `quote_line_items` table directly, which is blocked by RLS for unauthenticated users.

**Root Cause**: The RPC function `get_public_quote_line_items` exists specifically to provide public access, but wasn't being used.

**Fix Applied**: Changed to use the RPC function instead of direct table query.

```typescript
// BEFORE (BROKEN):
const { data: lineItems } = await supabase
  .from('quote_line_items')  // ❌ Blocked by RLS
  .select('*')
  .eq('quote_id', quoteData.id)

// AFTER (FIXED):
const { data: lineItems } = await supabase.rpc(
  'get_public_quote_line_items',  // ✅ Security DEFINER function
  { p_token: token }
);
```

---

### 4. **LOW: Missing Error Handling and Debugging**
**Location**: `src/screens/sendestimate.tsx`

**Problem**: Silent failures made debugging impossible. No user feedback when things went wrong.

**Fix Applied**:
- Added error state management
- Added comprehensive console logging
- Added user-friendly error messages
- Added visual error display

---

## Database Verification

### Quotes Table ✅
- ✅ `approval_token` column exists with `DEFAULT gen_random_uuid()`
- ✅ `is_public` column exists with `DEFAULT true`
- ✅ All existing quotes have approval tokens (80/80)
- ✅ All quotes are marked as public (80/80)

### Invoices Table ✅
- ✅ `approval_token` column exists with `DEFAULT gen_random_uuid()`
- ✅ `is_public` column exists with `DEFAULT true`
- ✅ All existing invoices have approval tokens (3/3)
- ✅ All invoices are marked as public (3/3)
- ✅ Relationship: `source_quote_id` → `quotes.id`

### RLS Policies ✅
- ✅ Quotes: Authenticated users can SELECT from their org
- ✅ Invoices: Authenticated users can SELECT from their org
- ✅ Public functions bypass RLS with SECURITY DEFINER

### Public Access Functions ✅
- ✅ `get_public_quote(uuid)` - Fixed with schema prefixes
- ✅ `get_public_quote_line_items(uuid)` - Working correctly
- ✅ `get_public_invoice(uuid)` - Working correctly
- ✅ `get_public_invoice_line_items(uuid)` - Working correctly

---

## Testing Performed

### Database Level
```sql
-- ✅ Quote public access works
SELECT * FROM get_public_quote('d7d1d185-7216-499f-ab4e-fded04b399a3'::uuid);
-- Returns: Full quote data

-- ✅ Quote line items work
SELECT * FROM get_public_quote_line_items('457805be-737a-4a6d-91b3-f47b7658d4cf'::uuid);
-- Returns: 6 line items

-- ✅ Invoice public access works
SELECT * FROM get_public_invoice('d68d2eb2-81e9-41cb-a065-8bbfcd6649e9'::uuid);
-- Returns: Full invoice data

-- ✅ Invoice data loads correctly
SELECT * FROM invoices WHERE source_quote_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
-- Returns: Invoice with approval_token and is_public = true
```

---

## Expected Behavior After Fixes

### For Estimates (Quotes):
1. User navigates to SendEstimate screen for a quote
2. Component fetches quote data with `source_quote_id` = quote ID
3. Component builds share URL: `${origin}/quote/${approval_token}`
4. User can share via native share dialog or copy link
5. Recipients can view quote publicly without authentication

### For Invoices:
1. User navigates to SendEstimate screen for an invoice (estimateId = source quote ID)
2. Component fetches invoice where `source_quote_id` = estimateId
3. Component builds share URL: `${origin}/invoice/${approval_token}`
4. User can share via native share dialog or copy link
5. Recipients can view invoice publicly without authentication

### Public Viewing:
1. Anonymous user visits `/quote/{token}` or `/invoice/{token}`
2. PublicRouter extracts token from URL
3. Calls `get_public_quote()` or `get_public_invoice()` RPC
4. Calls appropriate line items RPC function
5. Displays formatted quote/invoice with business info

---

## Files Modified

1. **src/screens/sendestimate.tsx**
   - Removed broken quote query for invoices
   - Added error state management
   - Added comprehensive logging
   - Added error message display

2. **src/publicrouter.tsx**
   - Changed to use `get_public_quote_line_items` RPC
   - Removed direct table query

3. **Database Migration: fix_get_public_quote_search_path.sql**
   - Recreated `get_public_quote()` with schema prefixes
   - Recreated `get_public_quote_line_items()` with schema prefixes
   - Both functions now work correctly with `search_path = ''`

---

## Root Causes Summary

1. **Data Model Confusion**: The codebase assumed a bidirectional relationship between quotes and invoices, but it's one-way (invoice → quote).

2. **Security Hardening Side Effect**: Migration 20251218042730 added `search_path = ''` to functions for security, but didn't update function bodies to use schema prefixes.

3. **Missing Documentation**: The RPC functions for public access existed but weren't documented, leading to direct table queries.

4. **Silent Failures**: Lack of error handling made debugging extremely difficult.

---

## Verification Steps for User

1. **Check Browser Console**: Look for detailed logs showing:
   - "SendEstimate] Fetching {type} data for estimateId: {id}"
   - "has_approval_token: true/false"
   - "is_public: true/false"
   - Generated share URL

2. **Test Quote Sharing**:
   - Create or open a draft quote
   - Navigate to send screen
   - Verify share URL appears
   - Copy link and open in incognito window
   - Verify public view works

3. **Test Invoice Sharing**:
   - Accept a quote (creates invoice)
   - Navigate to invoice send screen
   - Verify share URL appears
   - Copy link and open in incognito window
   - Verify public view works

---

## Known Limitations

1. **Test Data**: Some test invoices have 0 line items, which may cause display issues but won't break sharing.

2. **Missing Customer Data**: Some quotes/invoices have placeholder customers with null names, affecting public display.

3. **Line Items**: The `get_public_invoice_line_items` function works but some test invoices have no line items to return.

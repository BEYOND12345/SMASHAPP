# Debug Queries for Review Job Details Screen

## Test Case IDs
- intake_id: `e14e2451-9d09-472f-9ca2-a956babe29b0`
- created_quote_id: `088113a1-464e-4867-b174-69d87024ebbd`
- org_id: `19c5198a-3066-4aa7-8062-5daf602e615b`
- user_id: `6d0be049-5fa8-4b30-98fa-44631ec0c9be`

## Browser Console Commands

Open the browser console on the Review Job Details screen while logged in as the user and run these commands:

### Query 1: Fetch Quote
```javascript
(async () => {
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      *,
      customer:customers!customer_id(name)
    `)
    .eq('id', '088113a1-464e-4867-b174-69d87024ebbd')
    .maybeSingle();

  console.log('QUOTE QUERY RESULT:', {
    has_data: !!data,
    has_error: !!error,
    error: error,
    data: data
  });
  return { data, error };
})();
```

### Query 2: Fetch Voice Intake
```javascript
(async () => {
  const { data, error } = await supabase
    .from('voice_intakes')
    .select('*')
    .eq('id', 'e14e2451-9d09-472f-9ca2-a956babe29b0')
    .maybeSingle();

  console.log('INTAKE QUERY RESULT:', {
    has_data: !!data,
    has_error: !!error,
    error: error,
    stage: data?.stage,
    status: data?.status,
    created_quote_id: data?.created_quote_id,
    data: data
  });
  return { data, error };
})();
```

### Query 3: Fetch Quote Line Items
```javascript
(async () => {
  const { data, error } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', '088113a1-464e-4867-b174-69d87024ebbd')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  console.log('LINE ITEMS QUERY RESULT:', {
    has_data: !!data,
    has_error: !!error,
    error: error,
    count: data?.length || 0,
    real_items_count: data?.filter(item => !item.is_placeholder).length || 0,
    placeholder_count: data?.filter(item => item.is_placeholder).length || 0,
    items: data?.map(item => ({
      id: item.id,
      description: item.description,
      is_placeholder: item.is_placeholder,
      item_type: item.item_type,
      org_id: item.org_id
    }))
  });
  return { data, error };
})();
```

### Combined Test (Run All Three)
```javascript
(async () => {
  console.log('=== STARTING COMBINED DEBUG TEST ===');

  // Query 1: Quote
  const quoteResult = await supabase
    .from('quotes')
    .select(`*, customer:customers!customer_id(name)`)
    .eq('id', '088113a1-464e-4867-b174-69d87024ebbd')
    .maybeSingle();

  console.log('1. QUOTE:', {
    success: !quoteResult.error,
    error: quoteResult.error,
    title: quoteResult.data?.title,
    org_id: quoteResult.data?.org_id
  });

  // Query 2: Intake
  const intakeResult = await supabase
    .from('voice_intakes')
    .select('*')
    .eq('id', 'e14e2451-9d09-472f-9ca2-a956babe29b0')
    .maybeSingle();

  console.log('2. INTAKE:', {
    success: !intakeResult.error,
    error: intakeResult.error,
    stage: intakeResult.data?.stage,
    status: intakeResult.data?.status,
    created_quote_id: intakeResult.data?.created_quote_id
  });

  // Query 3: Line Items
  const lineItemsResult = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', '088113a1-464e-4867-b174-69d87024ebbd')
    .order('position', { ascending: true });

  const hasRealItems = lineItemsResult.data && lineItemsResult.data.some(item => !item.is_placeholder);
  const isDraftDone = intakeResult.data?.stage === 'draft_done';

  console.log('3. LINE ITEMS:', {
    success: !lineItemsResult.error,
    error: lineItemsResult.error,
    total_count: lineItemsResult.data?.length || 0,
    real_items: lineItemsResult.data?.filter(i => !i.is_placeholder).length || 0,
    placeholders: lineItemsResult.data?.filter(i => i.is_placeholder).length || 0
  });

  console.log('=== PROCESSING CONDITION CHECK ===');
  console.log({
    intake_stage: intakeResult.data?.stage,
    is_draft_done: isDraftDone,
    has_real_items: hasRealItems,
    should_clear_processing: isDraftDone && hasRealItems,
    DIAGNOSIS: isDraftDone && hasRealItems
      ? '✅ Should NOT show processing banner'
      : '❌ Will show processing banner'
  });

  return {
    quote: quoteResult,
    intake: intakeResult,
    lineItems: lineItemsResult
  };
})();
```

## Direct Database Queries (For Verification)

Run these in Supabase SQL Editor to see the actual data:

```sql
-- Check voice intake
SELECT
  id,
  stage,
  status,
  created_quote_id,
  user_id,
  org_id,
  created_at
FROM voice_intakes
WHERE id = 'e14e2451-9d09-472f-9ca2-a956babe29b0';

-- Check quote
SELECT
  id,
  title,
  status,
  org_id,
  user_id,
  created_at
FROM quotes
WHERE id = '088113a1-464e-4867-b174-69d87024ebbd';

-- Check line items
SELECT
  id,
  quote_id,
  org_id,
  item_type,
  description,
  is_placeholder,
  is_needs_review,
  quantity,
  unit_price_cents,
  created_at
FROM quote_line_items
WHERE quote_id = '088113a1-464e-4867-b174-69d87024ebbd'
ORDER BY position, created_at;

-- Check RLS policies (as authenticated user)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('quotes', 'voice_intakes', 'quote_line_items')
ORDER BY tablename, policyname;
```

## Expected Results

If everything is working correctly, you should see:
1. **Quote query**: Returns quote data with title and org_id
2. **Intake query**: Returns intake with `stage = 'draft_done'` and `created_quote_id` matching the quote
3. **Line items query**: Returns multiple items where at least one has `is_placeholder = false`

## Possible Failure Scenarios

### Scenario A: RLS Denial
**Symptom:** `error.code = '42501'` or error message contains "permission denied" or "policy"
**Cause:** User doesn't have permission to read the records
**Fix:** Check org_id matches and RLS policies allow authenticated user to read their org's data

### Scenario B: Org ID Mismatch
**Symptom:** Queries return `data: null` with no error
**Cause:** RLS filters are working but org_id doesn't match user's org
**Fix:** Verify user's org_id matches the records' org_id

### Scenario C: Wrong ID Being Used
**Symptom:** Quote or intake not found
**Cause:** Component received wrong IDs as props
**Fix:** Check routing and navigation code that passes these IDs

### Scenario D: Race Condition
**Symptom:** Initial load shows no data, but refresh shows data
**Cause:** Component renders before async data load completes
**Fix:** Ensure `loading` state prevents processing checks until data loads

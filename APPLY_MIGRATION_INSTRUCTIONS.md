# Apply Migration Instructions

## Critical: Apply the Database Migration

The migration file `supabase/migrations/20260108000000_fix_get_public_quote_created_by_column.sql` **MUST** be applied to your Supabase database to fix the "quote not found" error.

### Steps to Apply:

1. **Open Supabase Dashboard**
   - Go to your Supabase project dashboard
   - Navigate to **SQL Editor**

2. **Copy the Migration SQL**
   - Open the file: `supabase/migrations/20260108000000_fix_get_public_quote_created_by_column.sql`
   - Copy the **entire contents** of the file

3. **Run the SQL**
   - Paste the SQL into the SQL Editor
   - Click **Run** or press `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows)
   - Wait for confirmation that it executed successfully

4. **Verify the Fix**
   - The migration updates the `get_public_quote` and `get_public_invoice` functions
   - It fixes the column reference from `u.organization_id` (which doesn't exist) to `u.org_id` (correct)
   - It also fixes `created_by` to `created_by_user_id`

### What This Migration Fixes:

- ✅ Fixes `column u.organization_id does not exist` error
- ✅ Fixes `column q.created_by does not exist` error  
- ✅ Updates both `get_public_quote` and `get_public_invoice` functions
- ✅ Handles NULL `created_by_user_id` cases properly

### After Applying:

1. Test the voice recording feature
2. Record a new voice quote
3. After navigation, the quote should load correctly
4. Check browser console for any remaining errors

### If You Still See Errors:

Check the browser console for the detailed error message. The improved error logging will show:
- Error code
- Error message
- Error details
- The identifier being used

Share these details if the issue persists.

# Invoice Creation Flow Test Guide

## Expected Flow (After Recent Fixes)

### Step 1: Create a Quote via Voice
1. Click the microphone FAB button
2. Record your voice note describing a job
3. Stop recording
4. You should see "Review Draft" screen with the extracted quote data
5. Click "Create Quote" to save it

### Step 2: Convert Quote to Invoice
1. From the Estimates list, tap on your quote
2. You should see the "Job Card" screen
3. Tap "View Estimate"
4. You should see 3 buttons: "Edit", "Send Estimate", and "Send as Invoice"
5. Tap "Send as Invoice"

### Step 3: What Should Happen
- The app creates an invoice from your quote
- You're taken to the "Send Invoice" screen
- You should see a share link you can copy
- The invoice design looks the same as the quote (this is intentional)

## Common Issues

### Issue: "Unable to extract details automatically"
**Cause**: The voice recording couldn't be processed or was unclear
**Solution**:
- Try recording again with clearer audio
- Make sure you mention materials and labor clearly
- Check browser console for specific errors

### Issue: No invoice created / Stuck on loading
**Cause**: Database query failing or missing invoice ID
**Fix Applied**:
- Now properly reloads invoice data after creation
- Passes correct invoice ID to SendEstimate screen
- Queries invoice by ID instead of quote ID

### Issue: "Cannot see any changes to the design"
**Expected**: The invoice and quote use the same design template intentionally
**Note**: Both generate professional PDFs with your business info

## Debugging Steps

1. **Open Browser Console** (F12)
2. **Look for these log messages**:
   ```
   [App] Converting draft quote directly to invoice: <quote-id>
   [App] Invoice created successfully: <invoice-id>
   [SendEstimate] Fetching invoice data for estimateId: <invoice-id>
   [SendEstimate] Invoice data loaded: ...
   ```

3. **If you see errors**, copy the full error message and share it

4. **Check the Network tab** for failed requests to:
   - `/rest/v1/quotes?...`
   - `/rest/v1/invoices?...`
   - `/functions/v1/create_invoice_from_accepted_quote`

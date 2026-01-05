# Quote Editor Test Guide

## Quick Test Checklist

### ✅ Phase 1: Voice Recording (New Checklist)
1. **Start Recording**
   - Navigate to voice recorder
   - Verify new checklist appears with 6 items in Title Case:
     - Customer & Location
     - Scope of Work
     - Materials Needed
     - Labour Estimate
     - Additional Fees
     - Timeline (Optional)

2. **Speak Test Script**
   ```
   "Quote for Sarah at Ocean Shores. Installing new deck,
   about 20 square meters. Need merbau timber, maybe 50 linear meters,
   plus screws and oil. Should take 2 to 3 days.
   Plus travel time, about an hour each way.
   Can start next week if she approves."
   ```

3. **Verify Live Checklist**
   - ✓ Customer & Location lights up when "Sarah" mentioned
   - ✓ Scope lights up on "Installing new deck"
   - ✓ Materials lights up on "merbau timber"
   - ✓ Labour lights up on "2 to 3 days"
   - ✓ Fees lights up on "travel time"
   - ✓ Timeline lights up on "next week"

4. **Stop Recording**
   - Click stop button
   - Should navigate immediately to QuoteEditor
   - Green success banner should appear at top

---

### ✅ Phase 2: QuoteEditor Screen

**First Load (Success Animation)**
- [ ] Green banner shows: "Quote generated! Review and send below"
- [ ] Banner fades out after 2 seconds
- [ ] "Saving..." indicator NOT shown yet (nothing changed)

**Job Details Section**
- [ ] Title shows extracted job name (e.g., "Deck Installation")
- [ ] Client shows customer name or "No customer"
- [ ] Location shows "Ocean Shores" (as spoken, not formatted address)
- [ ] Timeline shows "2-3 days" (natural language)
- [ ] Each field has edit icon on right

**Scope of Work Section**
- [ ] Bullet list of extracted tasks
- [ ] Plus button in header to add more
- [ ] Each item has X button on hover

**Materials Section**
- [ ] Lists all materials with qty × rate = total
- [ ] Shows badges:
   - Yellow "AI" badge if AI-estimated
   - Green "Catalog" badge if matched to catalog
- [ ] Tap item to edit
- [ ] X button appears on hover to delete

**Labour Section**
- [ ] Shows labour hours with rate
- [ ] Same editing behavior as materials

**Fees Section**
- [ ] Shows travel fees, callout fees
- [ ] Total only (no qty × rate breakdown)

**Totals Card**
- [ ] Subtotal (materials + labour + fees)
- [ ] Tax (GST)
- [ ] Total in large text

---

### ✅ Phase 3: Inline Editing

**Test Title Edit:**
1. Tap "Deck Installation" field
2. Input changes to inline edit mode (blue border)
3. Check and X buttons appear
4. Type new text: "Deck Replacement"
5. Click check button
6. "Saving..." appears briefly
7. After ~1 second: "✓ Saved" appears
8. Field returns to display mode

**Test Location Edit:**
1. Tap location field
2. Type: "123 Beach Rd, Ocean Shores"
3. Save
4. Verify auto-save triggers

**Test Timeline Edit:**
1. Tap timeline (shows "[Tap to add]" if empty)
2. Type: "Next week - 2-3 days"
3. Save
4. Verify saves correctly

**Test Auto-Save Debouncing:**
1. Edit title
2. Type several characters quickly
3. Stop typing
4. Watch "Saving..." appear after 500ms
5. Watch "✓ Saved" appear after save completes
6. Edit another field before first save completes
7. Verify only one "Saving..." state active

---

### ✅ Phase 4: Line Item Editing

**Edit Material Item:**
1. Tap "Merbau Decking 90mm × 5.4m"
2. Bottom sheet slides up from bottom
3. Shows form with:
   - Description field
   - Quantity field
   - Unit field (e.g., "m", "sheets")
   - Rate field
4. Change quantity from 50 to 55
5. Click Save button
6. Sheet closes
7. Verify item updates in list
8. Verify total recalculates

**Edit Labour Item:**
1. Tap labour entry
2. Bottom sheet opens
3. Change hours from 16 to 20
4. Change rate from $85 to $90
5. Save
6. Verify updates and totals recalculate

**Delete Item:**
1. Hover over any line item
2. X button appears on right
3. Click X
4. Confirm dialog appears
5. Confirm deletion
6. Item removed
7. Totals recalculate

---

### ✅ Phase 5: Scope of Work Management

**Add Scope Item:**
1. Click + button in Scope header
2. Prompt appears: "Enter scope item:"
3. Type: "Remove and dispose of old deck"
4. Click OK
5. Item added to bullet list
6. Auto-save triggers

**Delete Scope Item:**
1. Hover over scope item
2. X appears
3. Click X
4. Item removed immediately
5. Auto-save triggers

---

### ✅ Phase 6: Send Actions

**Test Send Estimate:**
1. Click blue "Send Estimate" button
2. If mobile: Native share sheet appears
3. If desktop: Alert shows
4. Share includes link to public quote view

**Test Send as Invoice:**
1. Click white "Send as Invoice" button
2. Currently shows: "Convert to Invoice coming soon"
3. (Future: converts quote to invoice)

**Test Copy Link:**
1. Click "Copy Link" text button (bottom)
2. Alert: "Link copied!"
3. Paste in new tab
4. Verify opens public quote view

**Test Download PDF:**
1. Click "Download PDF" text button
2. Currently shows: "PDF download coming soon"
3. (Future: generates PDF)

---

### ✅ Phase 7: Delete Quote

1. Click trash icon (top right)
2. Confirm dialog: "Delete this quote?"
3. Click OK
4. Quote deleted from database
5. Returns to quotes list
6. Quote no longer appears

---

## Database Verification

**Check Migration Applied:**
```sql
-- Verify new columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'quotes'
AND column_name IN ('site_address', 'timeline_description');
```

**Expected Results:**
```
column_name          | data_type
---------------------|----------
site_address         | text
timeline_description | text
```

**Check Data Saved:**
```sql
-- After creating a test quote
SELECT
  id,
  title,
  site_address,
  timeline_description,
  scope_of_work
FROM quotes
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Results:**
```
title: "Deck Installation"
site_address: "Ocean Shores"
timeline_description: "2-3 days"
scope_of_work: ["Install new deck", "Oil and finish"]
```

---

## Edge Cases to Test

### Empty States
- [ ] No materials → Section doesn't appear
- [ ] No labour → Section doesn't appear
- [ ] No fees → Section doesn't appear
- [ ] Empty location → Shows "[Tap to add]"
- [ ] Empty timeline → Shows "[Tap to add]"
- [ ] Empty scope → Shows "No scope items yet"

### Concurrent Edits
- [ ] Edit title while another field is saving
- [ ] Edit multiple fields rapidly
- [ ] Verify no save conflicts
- [ ] Verify status indicator stays accurate

### Long Content
- [ ] Very long job title (50+ chars)
- [ ] Very long location (100+ chars)
- [ ] Many scope items (10+)
- [ ] Many line items (20+)
- [ ] Verify scrolling works
- [ ] Verify layout doesn't break

### Network Issues
- [ ] Start edit, disconnect network, save
- [ ] Verify "Error" status appears
- [ ] Reconnect network
- [ ] Try save again
- [ ] Verify recovers gracefully

---

## Performance Checks

**Load Time:**
- [ ] Quote loads < 500ms
- [ ] Line items appear immediately
- [ ] No loading flicker

**Auto-Save Performance:**
- [ ] Debounce waits 500ms
- [ ] Save completes < 1 second
- [ ] No UI blocking during save
- [ ] Multiple rapid edits batched correctly

**Animation Performance:**
- [ ] Success banner fades smoothly
- [ ] Bottom sheet slides smoothly (no jank)
- [ ] Edit mode transitions smoothly
- [ ] 60fps throughout

---

## Browser/Device Testing

**Desktop Browsers:**
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge

**Mobile Browsers:**
- [ ] iOS Safari
- [ ] Chrome iOS
- [ ] Android Chrome
- [ ] Samsung Internet

**Responsive Breakpoints:**
- [ ] 375px (iPhone SE)
- [ ] 390px (iPhone 12/13/14)
- [ ] 414px (iPhone Plus)
- [ ] 768px (iPad)
- [ ] 1024px (Desktop)

---

## Success Criteria

✅ **All checklist items complete**
✅ **Build passes with no errors**
✅ **No console errors during normal use**
✅ **Auto-save works reliably**
✅ **All CRUD operations functional**
✅ **Mobile-first design responsive**
✅ **Performance meets targets**

---

## Known Limitations (Future Work)

- PDF download not implemented yet
- Invoice conversion not implemented yet
- Share on desktop shows alert (native share API only on mobile)
- Success animation always shows (should only show after voice recording)
- Add line item button not yet implemented
- Customer editing not implemented (shows read-only)

---

## Rollback Plan (If Needed)

If critical issues found:

1. **Restore old routing:**
   ```typescript
   // In app.tsx, change line ~651:
   currentScreen: 'ReviewDraft'  // instead of 'QuoteEditor'
   ```

2. **Old flow still works:**
   - ReviewDraft → EstimatePreview → SendEstimate
   - All old screens still in codebase
   - No data migration breaking changes

3. **Revert migration (if needed):**
   ```sql
   ALTER TABLE quotes
   DROP COLUMN site_address,
   DROP COLUMN timeline_description;
   ```

---

## Next Steps After Testing

1. Gather user feedback on:
   - Editing UX
   - Auto-save feel
   - Missing features
   - Layout improvements

2. Implement missing features:
   - Add line item button
   - PDF generation
   - Invoice conversion
   - Customer editing

3. Performance optimization:
   - Reduce initial bundle size
   - Implement line item virtualization if needed
   - Optimize auto-save debouncing

4. Polish:
   - Loading skeletons
   - Better error messages
   - Offline support
   - Undo/redo

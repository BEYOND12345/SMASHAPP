# Share Link Routing Fix - Verification Guide

## What Was Fixed

The app now properly handles public share links when logged-in users navigate to them. Previously, the URL would change but the app wouldn't respond.

## Implementation Summary

### Files Modified
1. **`src/lib/utils/routeHelpers.ts`** (NEW)
   - Added `parsePublicRoute()` - Parses URLs like `/q/ABC123` or `/invoice/XYZ789`
   - Added `isPublicRoute()` - Checks if a URL is a public route
   - Supports both short (`/q/`, `/i/`) and long (`/quote/`, `/invoice/`) formats

2. **`src/app.tsx`**
   - Added URL monitoring `useEffect` hook
   - Listens for URL changes (mount + popstate events)
   - When public route detected:
     - Queries database for quote/invoice by short_code
     - Loads full data from database
     - Navigates to JobCard or InvoicePreview
     - Cleans up URL to avoid confusion

### How It Works

**For Logged-In Users:**
1. User pastes `/q/EHL2T4B5` in URL bar
2. URL change is detected by `useEffect` hook
3. App queries: `SELECT id FROM quotes WHERE short_code = 'EHL2T4B5'`
4. If found, loads full quote data and navigates to JobCard
5. URL is cleaned to `/` to avoid showing internal route
6. User sees their familiar internal job card view

**For Logged-Out Users:**
1. User pastes `/q/EHL2T4B5` in URL bar
2. `main.tsx` detects public route pattern
3. Loads `PublicRouter` instead of `App`
4. Customer sees public quote with "Approve Quote" button
5. (No changes to this flow - already worked correctly)

## Testing Checklist

### Test 1: Logged-In User Navigates to Own Quote
**Steps:**
1. Log in to the app
2. Create a quote and copy the share link (e.g., `/q/ABC123`)
3. Paste the URL in the browser address bar
4. Press Enter

**Expected Result:**
- App navigates to JobCard for that quote
- You see your internal view (not the customer view)
- URL changes to `/` after a moment
- Console shows: `[App] Public route detected while logged in`

### Test 2: Logged-Out User Views Public Quote
**Steps:**
1. Open incognito/private browser window
2. Paste a quote share link (e.g., `/q/ABC123`)
3. Press Enter

**Expected Result:**
- PublicRouter loads
- Customer sees public quote view
- "Approve Quote" button is visible
- Business name and quote details are shown
- URL stays as `/q/ABC123`

### Test 3: Browser Back/Forward Navigation
**Steps:**
1. Log in to the app
2. Navigate to EstimatesList
3. Manually change URL to `/q/ABC123`
4. Click browser back button

**Expected Result:**
- Forward navigation loads the quote
- Back button returns to previous screen
- No errors in console

### Test 4: Invalid Short Code
**Steps:**
1. Log in to the app
2. Navigate to `/q/INVALID999`

**Expected Result:**
- Alert message: "Quote not found."
- App navigates back to EstimatesList
- URL changes to `/`
- No crashes

### Test 5: Invoice Share Links
**Steps:**
1. Log in to the app
2. Create an invoice and get share link
3. Navigate to `/i/XYZ789`

**Expected Result:**
- App navigates to InvoicePreview
- Invoice details are shown
- URL changes to `/`

### Test 6: Copy Link Feature
**Steps:**
1. Log in and create a quote
2. Go to Send Estimate screen
3. Click "Copy Link"
4. Verify copied URL format

**Expected Result:**
- URL format: `https://domain.com/q/SHORTCODE`
- Short code is 8 characters, uppercase
- URL is valid and can be pasted later

## Troubleshooting

### Issue: Quote not loading when pasting URL
**Check:**
- Is user logged in? (`state.isAuthenticated`)
- Does quote belong to this user? (RLS policies apply)
- Is short_code valid in database?
- Check browser console for errors

**Fix:**
```sql
-- Verify quote exists
SELECT id, short_code, user_id FROM quotes WHERE short_code = 'ABC123';

-- Verify user owns quote
SELECT * FROM quotes WHERE short_code = 'ABC123' AND user_id = auth.uid();
```

### Issue: URL doesn't change when pasted
**Check:**
- Is `useEffect` running? (Check console logs)
- Is `state.isAuthenticated` true?
- Is URL pattern valid? (Must match `/q/CODE` or `/quote/CODE`)

**Debug:**
```javascript
console.log('[Debug] Current path:', window.location.pathname);
console.log('[Debug] Parsed route:', parsePublicRoute(window.location.pathname));
console.log('[Debug] Is authenticated:', state.isAuthenticated);
```

### Issue: Infinite loop or repeated queries
**Check:**
- URL is being cleaned with `window.history.replaceState({}, '', '/')`
- `useEffect` dependencies are correct
- No circular state updates

## Security Notes

- RLS policies still apply - users can only see their own quotes
- Short codes are public identifiers (like UUIDs)
- No authentication is bypassed
- Public routes are intentionally accessible to anyone
- Logged-in users just see internal view instead of public view

## Performance Notes

- URL monitoring adds minimal overhead (runs only on mount + URL changes)
- Database query is simple: `SELECT id WHERE short_code = ?`
- Indexed lookup on `short_code` column (fast)
- Full quote data loaded only when needed

## Future Enhancements

Potential improvements:
1. Add loading spinner when looking up quote
2. Cache quote lookups to avoid repeated queries
3. Preload quote data when hovering over links
4. Add URL query params for specific views (e.g., `/q/ABC?view=items`)

## Success Criteria

This fix is successful when:
- ✅ Logged-in users can paste share links and see JobCard
- ✅ Logged-out users still see public view
- ✅ Browser navigation (back/forward) works correctly
- ✅ Invalid short codes are handled gracefully
- ✅ No console errors or crashes
- ✅ URL is cleaned after navigation

## Additional Notes

The fix maintains backward compatibility:
- Existing public routes still work
- No database migrations required
- No breaking changes to API
- Works with both short and long URL formats


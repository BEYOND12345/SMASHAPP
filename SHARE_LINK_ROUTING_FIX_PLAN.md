# Share Link Routing Fix - Implementation Plan

## Problem Statement
When logged-in users navigate to their own share links (e.g., `/q/EHL2T4B5`), the URL changes but the app doesn't respond because it uses pure state-based routing with no URL monitoring.

## Current Behavior
- URL changes to `/q/EHL2T4B5`
- App continues showing previous screen (state unchanged)
- User sees internal app view, not a properly routed screen

## Desired Behavior
- **Logged-in users**: Navigate to internal JobCard view for that quote
- **Logged-out users**: See public quote approval screen (already works)

## Implementation Steps

### 1. Modify `src/main.tsx`
**Current**: Checks if URL is public route, loads PublicRouter vs App
**New**: Also check if user is authenticated
- If public route AND not authenticated → PublicRouter
- If public route AND authenticated → App (will handle internally)
- If not public route → App

### 2. Add URL Monitoring to `src/app.tsx`
**Add new effect**:
- Listen for URL changes (popstate event + check on mount)
- Parse URL for public route patterns
- If detected, extract short_code
- Query database for quote with that short_code
- Navigate to JobCard with that quote selected

### 3. Create Helper Functions
```typescript
// Parse public route from URL
function parsePublicRoute(pathname: string): { type: 'quote' | 'invoice', code: string } | null

// Look up quote by short code
async function loadQuoteByShortCode(shortCode: string): Promise<string | null>

// Look up invoice by short code
async function loadInvoiceByShortCode(shortCode: string): Promise<string | null>
```

### 4. Handle Edge Cases
- Invalid short codes → Show error, navigate to EstimatesList
- Network errors → Show error, allow retry
- Browser back/forward → Properly detect URL changes
- Direct URL paste → Detect on app mount

## Technical Details

### URL Patterns to Match
- `/q/SHORTCODE` - Short quote URL
- `/quote/SHORTCODE` - Long quote URL
- `/i/SHORTCODE` - Short invoice URL
- `/invoice/SHORTCODE` - Long invoice URL

### Database Queries
```sql
-- For quotes
SELECT id FROM quotes WHERE short_code = UPPER(:code) AND owner_id = auth.uid()

-- For invoices
SELECT id, quote_id FROM invoices WHERE short_code = UPPER(:code)
```

### State Updates
When public route detected:
1. Query database for quote/invoice ID
2. Update state: `selectedEstimateId` = found ID
3. Navigate: `currentScreen` = 'JobCard'
4. Update URL history if needed

## Files to Modify
1. ✅ `src/main.tsx` - Add auth check to router decision
2. ✅ `src/app.tsx` - Add URL monitoring and handlers
3. ✅ Create utility functions for parsing and lookup

## Testing Checklist
- [ ] Paste `/q/ABC123` while logged in → See JobCard
- [ ] Paste `/q/ABC123` while logged out → See public view
- [ ] Click browser back button → URL routing works
- [ ] Invalid short code → Graceful error
- [ ] Customer receives link → Sees public view
- [ ] Share link from SendEstimate → Correct format

## Security Considerations
- RLS policies ensure users can only see their own quotes
- Public routes accessible to anyone (by design)
- Short codes are non-sensitive identifiers (like UUIDs)
- No additional security concerns

## Implementation Complete
This plan provides comprehensive fix for share link routing while maintaining security and UX.

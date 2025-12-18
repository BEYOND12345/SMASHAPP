/*
  # Fix public_quote_view data leak

  ## Security Fix
  
  The `public_quote_view` was accessible to the public role without requiring
  an approval token, allowing enumeration of all public quotes and their tokens.
  
  ## Changes
  
  1. Drop `public_quote_view` entirely
     - Views do not support RLS
     - Cannot be secured via policies
     - Creates data leak vulnerability
  
  2. Public access pattern
     - ✅ Use SECURITY DEFINER functions only
     - ✅ `get_public_quote(token)` - requires token
     - ✅ `get_public_quote_line_items(token)` - requires token
     - ❌ No direct view or table access
  
  ## Security Model
  
  - Public role: No table/view access, function access only
  - Token required: All public functions validate token
  - Single quote: Functions return at most one quote per token
  - No enumeration: Impossible to list all quotes without tokens
*/

-- Drop the vulnerable view
DROP VIEW IF EXISTS public_quote_view CASCADE;

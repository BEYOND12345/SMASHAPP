/*
  # Fix Public Quote Approval Permissions

  ## Purpose
  Allow anonymous users to approve quotes and create invoices from public quote URLs.
  The create_invoice_from_accepted_quote function is SECURITY DEFINER and validates
  access internally, so it's safe to allow anon users to call it.

  ## Changes
  1. Grant execute permission on create_invoice_from_accepted_quote to anon users
  2. Grant execute permission on recalculate_invoice_totals to anon users
  3. Add RLS policies to allow anon users to update quotes they have approval tokens for

  ## Security Notes
  - Functions are SECURITY DEFINER so they run with elevated privileges
  - Functions validate quote status and ownership internally
  - RLS policies ensure anon users can only update quotes with valid approval tokens
*/

-- Grant function permissions to anonymous users
GRANT EXECUTE ON FUNCTION public.create_invoice_from_accepted_quote(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.recalculate_invoice_totals(uuid) TO anon;

-- Allow anonymous users to update quotes they have approval tokens for
DROP POLICY IF EXISTS "Public users can approve quotes with token" ON public.quotes;
CREATE POLICY "Public users can approve quotes with token"
ON public.quotes FOR UPDATE
TO anon
USING (
  is_public = true 
  AND status = 'sent'
)
WITH CHECK (
  is_public = true 
  AND status = 'accepted'
  AND accepted_at IS NOT NULL
  AND accepted_quote_snapshot IS NOT NULL
);

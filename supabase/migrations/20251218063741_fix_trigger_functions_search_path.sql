/*
  # Fix Trigger Functions with Empty Search Path
  
  1. Problem
    - Trigger functions have empty search_path but use unqualified table names
    - This causes "relation does not exist" errors during INSERT/UPDATE operations
    
  2. Solution
    - Update all trigger functions to use fully-qualified table names (public.table_name)
    - Keep empty search_path for security
    
  3. Functions Fixed
    - enforce_quote_relationship_integrity
    - enforce_line_item_org_consistency
    
  4. Security
    - Maintains empty search_path to prevent injection
    - Uses fully-qualified names for all references
*/

-- Fix enforce_quote_relationship_integrity
CREATE OR REPLACE FUNCTION public.enforce_quote_relationship_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_customer_org uuid;
  v_address_customer uuid;
  v_address_org uuid;
BEGIN
  SELECT org_id INTO v_customer_org FROM public.customers WHERE id = NEW.customer_id;
  IF v_customer_org IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF NEW.org_id <> v_customer_org THEN
    RAISE EXCEPTION 'Quote org_id must match customer org_id';
  END IF;

  IF NEW.site_address_id IS NOT NULL THEN
    SELECT customer_id, org_id INTO v_address_customer, v_address_org 
    FROM public.customer_addresses 
    WHERE id = NEW.site_address_id;
    
    IF v_address_customer IS NULL THEN
      RAISE EXCEPTION 'Site address not found';
    END IF;
    
    IF v_address_customer <> NEW.customer_id THEN
      RAISE EXCEPTION 'Site address must belong to the quote customer';
    END IF;
    
    IF v_address_org <> NEW.org_id THEN
      RAISE EXCEPTION 'Site address org_id must match quote org_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix enforce_line_item_org_consistency
CREATE OR REPLACE FUNCTION public.enforce_line_item_org_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_quote_org uuid;
BEGIN
  SELECT org_id INTO v_quote_org FROM public.quotes WHERE id = NEW.quote_id;
  IF v_quote_org IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF NEW.org_id <> v_quote_org THEN
    RAISE EXCEPTION 'Line item org_id must match quote org_id';
  END IF;

  RETURN NEW;
END;
$$;

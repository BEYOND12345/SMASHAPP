/*
  # Fix enforce_quote_relationship_integrity Column Reference
  
  1. Problem
    - Function references site_address_id but column is actually address_id
    
  2. Solution
    - Update function to use correct column name
*/

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

  IF NEW.address_id IS NOT NULL THEN
    SELECT customer_id, org_id INTO v_address_customer, v_address_org 
    FROM public.customer_addresses 
    WHERE id = NEW.address_id;
    
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

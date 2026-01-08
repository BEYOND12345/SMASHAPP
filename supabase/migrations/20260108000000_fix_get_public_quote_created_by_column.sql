/*
  # Fix get_public_quote and get_public_invoice - Use correct column name

  ## Problem
  The `get_public_quote` and `get_public_invoice` functions reference `q.created_by` 
  and `i.created_by`, but the actual column names in the tables are:
  - `quotes.created_by_user_id`
  - `invoices.created_by_user_id`

  This causes the error: "column q.created_by does not exist"

  ## Solution
  Update both functions to use `created_by_user_id` instead of `created_by`
*/

-- Fix get_public_quote function - UUID lookup
CREATE OR REPLACE FUNCTION get_public_quote(identifier text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quote_data json;
  is_uuid boolean;
BEGIN
  -- Check if identifier is a valid UUID
  BEGIN
    PERFORM identifier::uuid;
    is_uuid := true;
  EXCEPTION WHEN OTHERS THEN
    is_uuid := false;
  END;
  
  -- Query based on identifier type
  IF is_uuid THEN
    -- UUID lookup (backward compatibility)
    SELECT json_build_object(
      'id', q.id,
      'short_code', q.short_code,
      'quote_number', q.quote_number,
      'status', q.status,
      'customer_name', c.name,
      'customer_email', c.email,
      'customer_phone', c.phone,
      'scope_of_work', q.scope_of_work,
      'subtotal', q.subtotal,
      'tax', q.tax,
      'total', q.total,
      'created_at', q.created_at,
      'expires_at', q.expires_at,
      'accepted_at', q.accepted_at,
      'line_items', COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', qli.id,
            'description', qli.description,
            'quantity', qli.quantity,
            'unit_price', qli.unit_price,
            'line_total', qli.line_total,
            'sort_order', qli.sort_order
          ) ORDER BY qli.sort_order, qli.created_at
        )
        FROM quote_line_items qli
        WHERE qli.quote_id = q.id),
        '[]'::json
      ),
      'organization', json_build_object(
        'business_name', o.business_name,
        'business_number', o.business_number,
        'address_line1', o.address_line1,
        'address_line2', o.address_line2,
        'city', o.city,
        'state', o.state,
        'postal_code', o.postal_code,
        'country', o.country,
        'phone', o.phone,
        'email', o.email,
        'website', o.website
      )
    ) INTO quote_data
    FROM quotes q
    JOIN customers c ON c.id = q.customer_id
    LEFT JOIN users u ON u.id = q.created_by_user_id
    LEFT JOIN organizations o ON o.id = COALESCE(u.organization_id, q.org_id)
    WHERE q.id = identifier::uuid;
  ELSE
    -- Short code lookup
    SELECT json_build_object(
      'id', q.id,
      'short_code', q.short_code,
      'quote_number', q.quote_number,
      'status', q.status,
      'customer_name', c.name,
      'customer_email', c.email,
      'customer_phone', c.phone,
      'scope_of_work', q.scope_of_work,
      'subtotal', q.subtotal,
      'tax', q.tax,
      'total', q.total,
      'created_at', q.created_at,
      'expires_at', q.expires_at,
      'accepted_at', q.accepted_at,
      'line_items', COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', qli.id,
            'description', qli.description,
            'quantity', qli.quantity,
            'unit_price', qli.unit_price,
            'line_total', qli.line_total,
            'sort_order', qli.sort_order
          ) ORDER BY qli.sort_order, qli.created_at
        )
        FROM quote_line_items qli
        WHERE qli.quote_id = q.id),
        '[]'::json
      ),
      'organization', json_build_object(
        'business_name', o.business_name,
        'business_number', o.business_number,
        'address_line1', o.address_line1,
        'address_line2', o.address_line2,
        'city', o.city,
        'state', o.state,
        'postal_code', o.postal_code,
        'country', o.country,
        'phone', o.phone,
        'email', o.email,
        'website', o.website
      )
    ) INTO quote_data
    FROM quotes q
    JOIN customers c ON c.id = q.customer_id
    LEFT JOIN users u ON u.id = q.created_by_user_id
    LEFT JOIN organizations o ON o.id = COALESCE(u.organization_id, q.org_id)
    WHERE q.short_code = UPPER(identifier);
  END IF;
  
  RETURN quote_data;
END;
$$;

-- Fix get_public_invoice function - UUID lookup
CREATE OR REPLACE FUNCTION get_public_invoice(identifier text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invoice_data json;
  is_uuid boolean;
BEGIN
  -- Check if identifier is a valid UUID
  BEGIN
    PERFORM identifier::uuid;
    is_uuid := true;
  EXCEPTION WHEN OTHERS THEN
    is_uuid := false;
  END;
  
  -- Query based on identifier type
  IF is_uuid THEN
    -- UUID lookup (backward compatibility)
    SELECT json_build_object(
      'id', i.id,
      'short_code', i.short_code,
      'invoice_number', i.invoice_number,
      'status', i.status,
      'customer_name', c.name,
      'customer_email', c.email,
      'customer_phone', c.phone,
      'subtotal', i.subtotal,
      'tax', i.tax,
      'total', i.total,
      'amount_paid', i.amount_paid,
      'amount_due', i.amount_due,
      'issued_at', i.issued_at,
      'due_at', i.due_at,
      'paid_at', i.paid_at,
      'created_at', i.created_at,
      'line_items', COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', ili.id,
            'item_type', ili.item_type,
            'description', ili.description,
            'quantity', ili.quantity,
            'unit_price', ili.unit_price,
            'line_total', ili.line_total,
            'sort_order', ili.sort_order
          ) ORDER BY ili.sort_order, ili.created_at
        )
        FROM invoice_line_items ili
        WHERE ili.invoice_id = i.id),
        '[]'::json
      ),
      'organization', json_build_object(
        'business_name', o.business_name,
        'business_number', o.business_number,
        'address_line1', o.address_line1,
        'address_line2', o.address_line2,
        'city', o.city,
        'state', o.state,
        'postal_code', o.postal_code,
        'country', o.country,
        'phone', o.phone,
        'email', o.email,
        'website', o.website,
        'payment_instructions', p.payment_instructions,
        'bank_name', p.bank_name,
        'account_name', p.account_name,
        'account_number', p.account_number,
        'routing_number', p.routing_number,
        'bsb', p.bsb
      )
    ) INTO invoice_data
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN users u ON u.id = i.created_by_user_id
    LEFT JOIN organizations o ON o.id = COALESCE(u.organization_id, i.org_id)
    LEFT JOIN profiles p ON p.id = i.created_by_user_id
    WHERE i.id = identifier::uuid;
  ELSE
    -- Short code lookup
    SELECT json_build_object(
      'id', i.id,
      'short_code', i.short_code,
      'invoice_number', i.invoice_number,
      'status', i.status,
      'customer_name', c.name,
      'customer_email', c.email,
      'customer_phone', c.phone,
      'subtotal', i.subtotal,
      'tax', i.tax,
      'total', i.total,
      'amount_paid', i.amount_paid,
      'amount_due', i.amount_due,
      'issued_at', i.issued_at,
      'due_at', i.due_at,
      'paid_at', i.paid_at,
      'created_at', i.created_at,
      'line_items', COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', ili.id,
            'item_type', ili.item_type,
            'description', ili.description,
            'quantity', ili.quantity,
            'unit_price', ili.unit_price,
            'line_total', ili.line_total,
            'sort_order', ili.sort_order
          ) ORDER BY ili.sort_order, ili.created_at
        )
        FROM invoice_line_items ili
        WHERE ili.invoice_id = i.id),
        '[]'::json
      ),
      'organization', json_build_object(
        'business_name', o.business_name,
        'business_number', o.business_number,
        'address_line1', o.address_line1,
        'address_line2', o.address_line2,
        'city', o.city,
        'state', o.state,
        'postal_code', o.postal_code,
        'country', o.country,
        'phone', o.phone,
        'email', o.email,
        'website', o.website,
        'payment_instructions', p.payment_instructions,
        'bank_name', p.bank_name,
        'account_name', p.account_name,
        'account_number', p.account_number,
        'routing_number', p.routing_number,
        'bsb', p.bsb
      )
    ) INTO invoice_data
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN users u ON u.id = i.created_by_user_id
    LEFT JOIN organizations o ON o.id = COALESCE(u.organization_id, i.org_id)
    LEFT JOIN profiles p ON p.id = i.created_by_user_id
    WHERE i.short_code = UPPER(identifier);
  END IF;
  
  RETURN invoice_data;
END;
$$;

-- Grant public access to these functions
GRANT EXECUTE ON FUNCTION get_public_quote(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_public_invoice(text) TO anon, authenticated;

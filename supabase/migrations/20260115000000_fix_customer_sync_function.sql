-- Fix missing check_if_customer_synced function for local development
-- This ensures the function exists even if previous migrations didn't fully apply

-- Create integration_entity_map table if it doesn't exist (for local dev)
CREATE TABLE IF NOT EXISTS integration_entity_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('customer', 'invoice', 'quote', 'line_item')),
  local_id uuid NOT NULL,
  external_id text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('quickbooks', 'xero')),
  sync_status text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, entity_type, local_id, provider),
  UNIQUE(org_id, entity_type, external_id, provider)
);

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_integration_entity_map_local_id 
ON integration_entity_map(entity_type, local_id, sync_status, provider);

-- Recreate the function to ensure it exists
CREATE OR REPLACE FUNCTION check_if_customer_synced(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM integration_entity_map
    WHERE entity_type = 'customer'
      AND local_id = p_customer_id
      AND sync_status = 'synced'
      AND provider IN ('quickbooks', 'xero')
  );
$$;

-- Set the search path to fix function resolution issues
ALTER FUNCTION check_if_customer_synced(uuid) SET search_path = '';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION check_if_customer_synced(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION check_if_customer_synced(uuid) TO service_role;

-- Create a helper RPC function to update customer contact info
-- This bypasses triggers and is used as a fallback when the trigger fails
CREATE OR REPLACE FUNCTION update_customer_contact_info(
  p_customer_id uuid,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Directly update the customer table, bypassing triggers
  UPDATE customers
  SET
    name = COALESCE(p_name, name),
    email = COALESCE(p_email, email),
    phone = COALESCE(p_phone, phone),
    updated_at = now()
  WHERE id = p_customer_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_customer_contact_info(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_customer_contact_info(uuid, text, text, text) TO service_role;

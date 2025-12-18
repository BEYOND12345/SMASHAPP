/*
  # QuickBooks Integration Tables

  ## Overview
  Creates secure tables for managing QuickBooks Online OAuth connections and sync state.

  ## New Tables

  ### qb_oauth_states
  Temporary storage for OAuth state validation with automatic cleanup.
  - `id` (uuid, primary key) - Unique state identifier
  - `org_id` (uuid, not null) - Organization reference
  - `nonce` (text, not null) - Random nonce for CSRF protection
  - `created_at` (timestamptz) - When state was created
  - `expires_at` (timestamptz) - Expiration time (5 minutes)

  ### qb_connections
  Secure storage of QuickBooks OAuth tokens per organization.
  - `id` (uuid, primary key) - Connection identifier
  - `org_id` (uuid, not null, unique) - One connection per org
  - `realm_id` (text, not null) - QuickBooks company identifier
  - `company_name` (text, nullable) - Company display name
  - `access_token_encrypted` (text, not null) - Encrypted access token
  - `refresh_token_encrypted` (text, not null) - Encrypted refresh token
  - `token_expires_at` (timestamptz, not null) - Token expiration
  - `scopes` (text, not null) - OAuth scopes granted
  - `connected_at` (timestamptz) - Initial connection time
  - `updated_at` (timestamptz) - Last token refresh
  - `is_active` (boolean) - Connection status

  ## Security

  ### Encryption
  - Uses pgcrypto extension for token encryption
  - Tokens encrypted with organization-specific key derivation
  - Access tokens never stored in plaintext

  ### Row Level Security
  - qb_oauth_states: Org members can manage their org's states
  - qb_connections: Org members can read, only owners can write
  - No public access to either table

  ### Constraints
  - One active connection per organization
  - Unique realm_id per org prevents cross-wiring
  - Automatic cleanup of expired OAuth states

  ## Notes
  - OAuth states expire after 5 minutes
  - Use periodic cleanup job to remove expired states
  - Token refresh must update both token and expires_at atomically
*/

-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- OAuth state tracking table
CREATE TABLE IF NOT EXISTS qb_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nonce text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  CONSTRAINT uq_qb_oauth_state_nonce UNIQUE (nonce)
);

-- QuickBooks connections table
CREATE TABLE IF NOT EXISTS qb_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  realm_id text NOT NULL,
  company_name text,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scopes text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_qb_connection_org UNIQUE (org_id),
  CONSTRAINT uq_qb_connection_realm UNIQUE (org_id, realm_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_qb_oauth_states_org ON qb_oauth_states(org_id);
CREATE INDEX IF NOT EXISTS idx_qb_oauth_states_expires ON qb_oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_qb_connections_org ON qb_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_qb_connections_active ON qb_connections(org_id, is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE qb_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for qb_oauth_states
-- Org members can manage their org's OAuth states
CREATE POLICY "Org members can manage OAuth states"
  ON qb_oauth_states
  FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users 
      WHERE id = auth.uid()
    )
  );

-- RLS Policies for qb_connections
-- Org members can view their org's connection
CREATE POLICY "Org members can view connection"
  ON qb_connections
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users 
      WHERE id = auth.uid()
    )
  );

-- Org owners can insert connections
CREATE POLICY "Org owners can create connection"
  ON qb_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users 
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- Org owners can update connections
CREATE POLICY "Org owners can update connection"
  ON qb_connections
  FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users 
      WHERE id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users 
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- Helper function to encrypt tokens
-- Note: In production, use proper key management (e.g., Vault)
CREATE OR REPLACE FUNCTION encrypt_qb_token(token text, org_id uuid)
RETURNS text AS $$
DECLARE
  encryption_key text;
BEGIN
  -- Get encryption key from environment or use a fallback
  -- In production, this should come from a secure key management system
  BEGIN
    encryption_key := current_setting('app.settings.encryption_key', true);
  EXCEPTION
    WHEN OTHERS THEN
      encryption_key := 'fallback-key-for-development-only';
  END;
  
  -- Encrypt using org_id as part of the key derivation
  RETURN encode(
    pgp_sym_encrypt(
      token,
      encryption_key || org_id::text,
      'cipher-algo=aes256'
    ),
    'base64'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to decrypt tokens
CREATE OR REPLACE FUNCTION decrypt_qb_token(encrypted_token text, org_id uuid)
RETURNS text AS $$
DECLARE
  encryption_key text;
BEGIN
  -- Get encryption key from environment or use a fallback
  BEGIN
    encryption_key := current_setting('app.settings.encryption_key', true);
  EXCEPTION
    WHEN OTHERS THEN
      encryption_key := 'fallback-key-for-development-only';
  END;
  
  RETURN pgp_sym_decrypt(
    decode(encrypted_token, 'base64'),
    encryption_key || org_id::text,
    'cipher-algo=aes256'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to decrypt token';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired OAuth states (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM qb_oauth_states
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
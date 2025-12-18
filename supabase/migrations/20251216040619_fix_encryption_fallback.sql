/*
  # Fix QuickBooks Encryption Fallback

  ## Changes
  Removes insecure fallback encryption key from QuickBooks token encryption functions.
  System will now fail closed if encryption key is not properly configured.

  ## Security Impact
  - CRITICAL: Removes hardcoded fallback key 'fallback-key-for-development-only'
  - Functions will raise exception if app.settings.encryption_key is not set
  - Prevents tokens from being encrypted with known weak key

  ## Migration Safety
  - Existing encrypted tokens remain unchanged
  - Only affects new token encryption operations
  - If encryption key not configured, connection attempts will fail safely
*/

-- Drop and recreate encrypt function with fail-closed behavior
CREATE OR REPLACE FUNCTION encrypt_qb_token(token text, org_id uuid)
RETURNS text AS $$
DECLARE
  encryption_key text;
BEGIN
  -- Get encryption key from environment - FAIL if not present
  BEGIN
    encryption_key := current_setting('app.settings.encryption_key', true);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Encryption key not configured - cannot encrypt tokens. Set app.settings.encryption_key before connecting QuickBooks.';
  END;

  -- Additional check for null or empty key
  IF encryption_key IS NULL OR encryption_key = '' THEN
    RAISE EXCEPTION 'Encryption key is empty - cannot encrypt tokens. Set app.settings.encryption_key before connecting QuickBooks.';
  END IF;

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

-- Drop and recreate decrypt function with fail-closed behavior
CREATE OR REPLACE FUNCTION decrypt_qb_token(encrypted_token text, org_id uuid)
RETURNS text AS $$
DECLARE
  encryption_key text;
BEGIN
  -- Get encryption key from environment - FAIL if not present
  BEGIN
    encryption_key := current_setting('app.settings.encryption_key', true);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Encryption key not configured - cannot decrypt tokens. Set app.settings.encryption_key.';
  END;

  -- Additional check for null or empty key
  IF encryption_key IS NULL OR encryption_key = '' THEN
    RAISE EXCEPTION 'Encryption key is empty - cannot decrypt tokens. Set app.settings.encryption_key.';
  END IF;

  RETURN pgp_sym_decrypt(
    decode(encrypted_token, 'base64'),
    encryption_key || org_id::text,
    'cipher-algo=aes256'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to decrypt token - check encryption key configuration';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

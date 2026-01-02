/*
  # Recreate lock_voice_intake_for_quote_creation RPC Function

  1. Purpose
    - Drop existing function with incompatible signature
    - Create new function that locks voice_intakes for quote creation
    - Verify user ownership before locking
    - Return the locked row with all columns

  2. Function Details
    - Name: lock_voice_intake_for_quote_creation
    - Parameters: p_intake_id UUID, p_user_id UUID
    - Returns: TABLE (all voice_intakes columns)
    - Security: SECURITY DEFINER with explicit search_path

  3. Security
    - Verifies the intake belongs to the specified user
    - Uses FOR UPDATE to lock the row
    - Grants EXECUTE to authenticated users
    - SECURITY DEFINER with empty search_path for safety
*/

-- Drop existing function
DROP FUNCTION IF EXISTS public.lock_voice_intake_for_quote_creation(UUID, UUID);

-- Create function with correct return type
CREATE OR REPLACE FUNCTION public.lock_voice_intake_for_quote_creation(
  p_intake_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  org_id UUID,
  user_id UUID,
  customer_id UUID,
  source TEXT,
  audio_storage_path TEXT,
  audio_duration_seconds INTEGER,
  transcript_text TEXT,
  transcript_model TEXT,
  transcript_language TEXT,
  transcript_confidence NUMERIC,
  extraction_json JSONB,
  extraction_model TEXT,
  extraction_confidence NUMERIC,
  missing_fields JSONB,
  assumptions JSONB,
  status TEXT,
  created_quote_id UUID,
  error_code TEXT,
  error_message TEXT,
  user_corrections_json JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  stage TEXT,
  last_error TEXT,
  trace_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vi.id,
    vi.org_id,
    vi.user_id,
    vi.customer_id,
    vi.source,
    vi.audio_storage_path,
    vi.audio_duration_seconds,
    vi.transcript_text,
    vi.transcript_model,
    vi.transcript_language,
    vi.transcript_confidence,
    vi.extraction_json,
    vi.extraction_model,
    vi.extraction_confidence,
    vi.missing_fields,
    vi.assumptions,
    vi.status,
    vi.created_quote_id,
    vi.error_code,
    vi.error_message,
    vi.user_corrections_json,
    vi.created_at,
    vi.updated_at,
    vi.stage,
    vi.last_error,
    vi.trace_id
  FROM public.voice_intakes vi
  WHERE vi.id = p_intake_id
    AND vi.user_id = p_user_id
  FOR UPDATE;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.lock_voice_intake_for_quote_creation(UUID, UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.lock_voice_intake_for_quote_creation IS 'Lock a voice intake row for quote creation. Verifies user ownership and returns locked row.';

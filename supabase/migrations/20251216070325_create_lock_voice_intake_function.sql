/*
  # Create Function to Lock Voice Intake Row

  1. New Functions
    - `lock_voice_intake_for_quote_creation`
      - Locks a voice_intake row using FOR UPDATE
      - Returns the locked row
      - Used by create-draft-quote for idempotency

  2. Security
    - Function runs with SECURITY DEFINER
    - Validates user_id matches auth.uid()
    - Only returns rows owned by the calling user
*/

CREATE OR REPLACE FUNCTION lock_voice_intake_for_quote_creation(
  p_intake_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  user_id uuid,
  customer_id uuid,
  source text,
  audio_storage_path text,
  audio_duration_seconds int,
  transcript_text text,
  transcript_model text,
  transcript_language text,
  transcript_confidence numeric,
  extraction_json jsonb,
  extraction_model text,
  extraction_confidence numeric,
  missing_fields jsonb,
  assumptions jsonb,
  status text,
  created_quote_id uuid,
  error_code text,
  error_message text,
  user_corrections_json jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate that the caller owns this intake
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized access to voice intake';
  END IF;

  -- Lock and return the row
  RETURN QUERY
  SELECT vi.*
  FROM voice_intakes vi
  WHERE vi.id = p_intake_id
    AND vi.user_id = p_user_id
  FOR UPDATE;
END;
$$;
/*
  # Fix lock_voice_intake_for_quote_creation Search Path Issue
  
  1. Problem
    - Function has empty search_path but uses unqualified table names
    - This causes "relation voice_intakes does not exist" error
    
  2. Solution
    - Update function to use fully-qualified table names (public.voice_intakes, public.auth)
    - Keep empty search_path for security
    
  3. Security
    - Maintains SECURITY DEFINER
    - Maintains empty search_path to prevent injection
    - Uses fully-qualified names for all references
*/

CREATE OR REPLACE FUNCTION public.lock_voice_intake_for_quote_creation(
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
SET search_path = ''
AS $$
BEGIN
  -- Validate that the caller owns this intake (use fully-qualified auth.uid())
  IF p_user_id != (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized access to voice intake';
  END IF;

  -- Lock and return the row (use fully-qualified public.voice_intakes)
  RETURN QUERY
  SELECT vi.*
  FROM public.voice_intakes vi
  WHERE vi.id = p_intake_id
    AND vi.user_id = p_user_id
  FOR UPDATE;
END;
$$;

/*
  # Rate Limiting System

  1. New Tables
    - `rate_limit_buckets`: Tracks API call counts per user per endpoint
    
  2. Security
    - Enable RLS on rate_limit_buckets
    - Only service role can write
    - Users can view own rate limits
    
  3. Rate Limits
    - create-draft-quote: 10 per hour per user
    - extract-quote-data: 20 per hour per user
    - transcribe-voice-intake: 20 per hour per user
    - openai-proxy: 50 per hour per user
*/

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  call_count int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  window_end timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_user_endpoint 
  ON rate_limit_buckets(user_id, endpoint, window_end);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limit_window_end
  ON rate_limit_buckets(window_end);

-- RLS Policies
CREATE POLICY "Users can view own rate limits"
  ON rate_limit_buckets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role can manage rate limits"
  ON rate_limit_buckets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to check and increment rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id uuid,
  p_endpoint text,
  p_max_calls int,
  p_window_minutes int DEFAULT 60
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket RECORD;
  v_current_time timestamptz := now();
  v_window_end timestamptz;
  v_allowed boolean := false;
  v_remaining int := 0;
BEGIN
  v_window_end := v_current_time + (p_window_minutes || ' minutes')::interval;

  -- Try to find active bucket
  SELECT * INTO v_bucket
  FROM rate_limit_buckets
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND window_end > v_current_time
  ORDER BY window_end DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Create new bucket
    INSERT INTO rate_limit_buckets (user_id, endpoint, call_count, window_start, window_end)
    VALUES (p_user_id, p_endpoint, 1, v_current_time, v_window_end)
    RETURNING * INTO v_bucket;
    
    v_allowed := true;
    v_remaining := p_max_calls - 1;
  ELSIF v_bucket.call_count < p_max_calls THEN
    -- Increment existing bucket
    UPDATE rate_limit_buckets
    SET call_count = call_count + 1,
        updated_at = v_current_time
    WHERE id = v_bucket.id
    RETURNING * INTO v_bucket;
    
    v_allowed := true;
    v_remaining := p_max_calls - v_bucket.call_count;
  ELSE
    -- Rate limit exceeded
    v_allowed := false;
    v_remaining := 0;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'remaining', v_remaining,
    'reset_at', v_bucket.window_end,
    'limit', p_max_calls
  );
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for old rate limit records
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM rate_limit_buckets
  WHERE window_end < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql;

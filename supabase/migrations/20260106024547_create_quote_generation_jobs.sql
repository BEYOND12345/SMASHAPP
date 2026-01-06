/*
  # Create Quote Generation Jobs Table

  1. New Tables
    - `quote_generation_jobs`
      - `id` (uuid, primary key)
      - `org_id` (uuid, references organizations)
      - `user_id` (uuid)
      - `intake_id` (uuid, references voice_intakes)
      - `quote_id` (uuid, references quotes)
      - `status` (text) - queued, running, complete, failed
      - `current_step` (text) - location, customer, scope, materials, labour, fees
      - `steps_completed` (text array) - array of completed steps
      - `progress_percent` (integer) - 0-100
      - `extracted_data` (jsonb) - temporary storage
      - `created_at` (timestamptz)
      - `started_at` (timestamptz)
      - `completed_at` (timestamptz)
      - `last_updated_at` (timestamptz)
      - `error_message` (text)
      - `retry_count` (integer)

  2. Security
    - Enable RLS
    - Users can view jobs for their org
    - Service role has full access

  3. Performance
    - Indexes on status, intake_id, org_id
    - Enable realtime for live progress updates
*/

-- Create the table
CREATE TABLE IF NOT EXISTS quote_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  intake_id UUID NOT NULL REFERENCES voice_intakes(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  current_step VARCHAR(50),
  steps_completed TEXT[] DEFAULT ARRAY[]::TEXT[],
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),

  extracted_data JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),

  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  CONSTRAINT valid_status CHECK (status IN ('queued', 'running', 'complete', 'failed'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_quote_gen_jobs_status ON quote_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_quote_gen_jobs_intake ON quote_generation_jobs(intake_id);
CREATE INDEX IF NOT EXISTS idx_quote_gen_jobs_org ON quote_generation_jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_quote_gen_jobs_user ON quote_generation_jobs(user_id);

-- Enable RLS
ALTER TABLE quote_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view jobs for their org
CREATE POLICY "Users can view own org jobs"
  ON quote_generation_jobs
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

-- Users can insert jobs for their org
CREATE POLICY "Users can create jobs for own org"
  ON quote_generation_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );

-- Service role has full access
CREATE POLICY "Service role full access"
  ON quote_generation_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE quote_generation_jobs;

-- Function to auto-update last_updated_at
CREATE OR REPLACE FUNCTION update_quote_gen_job_timestamp()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_quote_gen_job_timestamp_trigger
  BEFORE UPDATE ON quote_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_quote_gen_job_timestamp();
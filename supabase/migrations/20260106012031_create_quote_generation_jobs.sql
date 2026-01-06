/*
  # Create Quote Generation Jobs Tracking System

  1. Purpose
    - Track async quote generation with real-time progress updates
    - Enable step-by-step extraction with visible progress
    - Provide resilience through partial result storage
    - Support real-time UI updates via subscriptions

  2. New Tables
    - `quote_generation_jobs`
      - Tracks each quote generation job from voice intake to completed quote
      - Stores progress, current step, partial data, errors
      - Enables real-time progress updates for UI

  3. Schema Design
    - `id`: Primary key for the job
    - `org_id`: Organization (for RLS and data isolation)
    - `user_id`: User who initiated the job
    - `intake_id`: Reference to voice_intakes
    - `quote_id`: Reference to quotes (null until quote created)
    - `status`: Job lifecycle (queued, running, partial, complete, failed)
    - `current_step`: What step is currently executing
    - `steps_completed`: Array of completed steps
    - `progress_percent`: 0-100 for progress bar
    - `partial_data`: JSONB storage for incremental extraction results
    - `error_message`: Error details if failed
    - `retry_count`: Number of retry attempts
    - Timestamps for tracking job duration

  4. Status Values
    - queued: Job created, waiting to start
    - running: Currently processing
    - partial: Some steps complete, can proceed with partial data
    - complete: All steps finished successfully
    - failed: Unrecoverable error

  5. Step Values (in order)
    - transcription: Audio → text
    - location: Extract job site location
    - customer: Extract customer info
    - scope: Extract scope of work
    - materials: Extract and price materials
    - labour: Extract labour hours
    - fees: Extract travel/callout fees
    - pricing: Calculate final pricing
    - quote_creation: Create quote record

  6. Security
    - RLS enabled
    - Users can only read/write their own org's jobs
    - Admin service role can access all jobs

  7. Indexes
    - Fast lookup by status (for job processing)
    - Fast lookup by intake_id (check if job exists)
    - Fast lookup by org_id (list org's jobs)
    - Fast lookup by quote_id (find job for quote)
*/

-- Create the jobs table
CREATE TABLE IF NOT EXISTS quote_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  intake_id UUID NOT NULL REFERENCES voice_intakes(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  current_step VARCHAR(50),
  steps_completed TEXT[] DEFAULT ARRAY[]::TEXT[],
  progress_percent INTEGER NOT NULL DEFAULT 0,

  -- Data storage
  partial_data JSONB DEFAULT '{}'::jsonb,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('queued', 'running', 'partial', 'complete', 'failed')),
  CONSTRAINT valid_progress CHECK (progress_percent >= 0 AND progress_percent <= 100),
  CONSTRAINT one_job_per_intake UNIQUE (intake_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_quote_jobs_status ON quote_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_quote_jobs_intake ON quote_generation_jobs(intake_id);
CREATE INDEX IF NOT EXISTS idx_quote_jobs_org ON quote_generation_jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_quote_jobs_quote ON quote_generation_jobs(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_jobs_user ON quote_generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_quote_jobs_updated ON quote_generation_jobs(last_updated_at);

-- Enable RLS
ALTER TABLE quote_generation_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own org jobs"
  ON quote_generation_jobs FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE users.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own org jobs"
  ON quote_generation_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE users.id = auth.uid()
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update own org jobs"
  ON quote_generation_jobs FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE users.id = auth.uid()
    )
  );

-- Helper function to update job progress
CREATE OR REPLACE FUNCTION update_job_progress(
  p_job_id UUID,
  p_step VARCHAR(50),
  p_progress INTEGER,
  p_partial_data JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE quote_generation_jobs
  SET
    current_step = p_step,
    progress_percent = p_progress,
    last_updated_at = NOW(),
    steps_completed = CASE
      WHEN NOT (p_step = ANY(steps_completed)) THEN array_append(steps_completed, p_step)
      ELSE steps_completed
    END,
    partial_data = CASE
      WHEN p_partial_data IS NOT NULL THEN partial_data || p_partial_data
      ELSE partial_data
    END,
    status = CASE
      WHEN p_progress >= 100 THEN 'complete'
      WHEN p_progress > 0 THEN 'running'
      ELSE status
    END,
    completed_at = CASE
      WHEN p_progress >= 100 THEN NOW()
      ELSE completed_at
    END
  WHERE id = p_job_id;
END;
$$;

-- Helper function to mark job as failed
CREATE OR REPLACE FUNCTION mark_job_failed(
  p_job_id UUID,
  p_error_message TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE quote_generation_jobs
  SET
    status = 'failed',
    error_message = p_error_message,
    last_updated_at = NOW()
  WHERE id = p_job_id;
END;
$$;

-- Helper function to mark job as started
CREATE OR REPLACE FUNCTION mark_job_started(
  p_job_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE quote_generation_jobs
  SET
    status = 'running',
    started_at = NOW(),
    last_updated_at = NOW()
  WHERE id = p_job_id;
END;
$$;

-- Helper function to complete job
CREATE OR REPLACE FUNCTION complete_job(
  p_job_id UUID,
  p_quote_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE quote_generation_jobs
  SET
    status = 'complete',
    quote_id = p_quote_id,
    progress_percent = 100,
    completed_at = NOW(),
    last_updated_at = NOW()
  WHERE id = p_job_id;
END;
$$;

-- Trigger to update last_updated_at on any change
CREATE OR REPLACE FUNCTION update_job_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_quote_generation_jobs_timestamp
  BEFORE UPDATE ON quote_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_job_timestamp();

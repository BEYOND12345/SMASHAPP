/*
  # Add Stage Tracking to Voice Intakes

  1. Changes
    - Add `stage` column to track processing progress
    - Add `last_error` column to capture failure details
    - Add `trace_id` column for end-to-end tracing

  2. Purpose
    - Enable deterministic root cause analysis for stuck processing
    - Track exactly where the pipeline fails or stalls
*/

ALTER TABLE voice_intakes
ADD COLUMN IF NOT EXISTS stage text DEFAULT 'created',
ADD COLUMN IF NOT EXISTS last_error text,
ADD COLUMN IF NOT EXISTS trace_id text;

CREATE INDEX IF NOT EXISTS idx_voice_intakes_stage ON voice_intakes(stage);
CREATE INDEX IF NOT EXISTS idx_voice_intakes_trace_id ON voice_intakes(trace_id);

COMMENT ON COLUMN voice_intakes.stage IS 'Processing stage: created, recorder_started, transcribe_started, transcribe_done, extract_started, extract_done, draft_started, draft_done, failed';
COMMENT ON COLUMN voice_intakes.last_error IS 'Last error message if processing failed';
COMMENT ON COLUMN voice_intakes.trace_id IS 'End-to-end trace ID for debugging';

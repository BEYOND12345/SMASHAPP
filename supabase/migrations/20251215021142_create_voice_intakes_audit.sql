/*
  # Create Voice Intakes Audit System
  
  1. New Tables
    - `voice_intakes`
      - `id` (uuid, primary key)
      - `org_id` (uuid, foreign key to organizations)
      - `user_id` (uuid, foreign key to auth.users)
      - `customer_id` (uuid, nullable foreign key to customers)
      - `source` (text enum: mobile, web)
      - `audio_storage_path` (text, required)
      - `audio_duration_seconds` (int, nullable)
      - `transcript_text` (text, nullable)
      - `transcript_model` (text, nullable)
      - `transcript_language` (text, nullable)
      - `transcript_confidence` (numeric, nullable)
      - `extraction_json` (jsonb, nullable)
      - `extraction_model` (text, nullable)
      - `extraction_confidence` (numeric, nullable)
      - `missing_fields` (jsonb, nullable)
      - `assumptions` (jsonb, nullable)
      - `status` (text enum: captured, transcribed, extracted, quote_created, needs_user_review, failed)
      - `created_quote_id` (uuid, nullable foreign key to quotes)
      - `error_code` (text, nullable)
      - `error_message` (text, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on voice_intakes
    - Users can read their own intakes
    - Users can create intakes
    - Users can update their own intakes
    - System functions can update via security definer
*/

CREATE TABLE IF NOT EXISTS voice_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('mobile', 'web')),
  audio_storage_path text NOT NULL,
  audio_duration_seconds int CHECK (audio_duration_seconds > 0),
  transcript_text text,
  transcript_model text,
  transcript_language text,
  transcript_confidence numeric CHECK (transcript_confidence >= 0 AND transcript_confidence <= 1),
  extraction_json jsonb,
  extraction_model text,
  extraction_confidence numeric CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  missing_fields jsonb,
  assumptions jsonb,
  status text NOT NULL DEFAULT 'captured' CHECK (status IN ('captured', 'transcribed', 'extracted', 'quote_created', 'needs_user_review', 'failed')),
  created_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  user_corrections_json jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS voice_intakes_org_id_idx ON voice_intakes(org_id);
CREATE INDEX IF NOT EXISTS voice_intakes_user_id_idx ON voice_intakes(user_id);
CREATE INDEX IF NOT EXISTS voice_intakes_customer_id_idx ON voice_intakes(customer_id);
CREATE INDEX IF NOT EXISTS voice_intakes_status_idx ON voice_intakes(status);
CREATE INDEX IF NOT EXISTS voice_intakes_created_quote_id_idx ON voice_intakes(created_quote_id);
CREATE INDEX IF NOT EXISTS voice_intakes_created_at_idx ON voice_intakes(created_at DESC);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_voice_intakes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER voice_intakes_updated_at
  BEFORE UPDATE ON voice_intakes
  FOR EACH ROW
  EXECUTE FUNCTION update_voice_intakes_updated_at();

-- RLS Policies
ALTER TABLE voice_intakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own voice intakes"
  ON voice_intakes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create voice intakes"
  ON voice_intakes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own voice intakes"
  ON voice_intakes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own voice intakes"
  ON voice_intakes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
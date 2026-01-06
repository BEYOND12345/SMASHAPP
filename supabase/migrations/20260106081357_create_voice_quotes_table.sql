/*
  # Create Voice Quotes Table

  ## Summary
  Creates the `voice_quotes` table for Phase 1 of the voice-to-quote feature.
  This table stores audio recordings with their processing status and extracted data.

  ## Changes

  ### New Tables
  - `voice_quotes`
    - `id` (uuid, primary key) - Unique identifier
    - `org_id` (uuid, foreign key → organizations) - Organization owning the quote
    - `customer_id` (uuid, foreign key → customers, nullable) - Associated customer
    - `audio_url` (text, required) - Full Supabase storage URL to audio file
    - `transcript` (text, nullable) - Transcribed text from audio (Phase 2)
    - `quote_data` (jsonb, nullable) - Extracted quote data (Phase 3)
    - `status` (text, required) - Processing status
    - `created_at` (timestamptz) - Record creation timestamp

  ### Indexes
  - `idx_voice_quotes_org` - Fast lookup by organization
  - `idx_voice_quotes_status` - Filter by processing status
  - `idx_voice_quotes_created` - Sort by creation date (descending)

  ### Security (RLS)
  - Enable RLS on `voice_quotes` table
  - Policy: Users can only access voice quotes for their organization
  - Policy applies to all operations (SELECT, INSERT, UPDATE, DELETE)

  ## Status Values
  - `recorded` - Audio uploaded, awaiting transcription (Phase 1)
  - `transcribing` - Transcription in progress (Phase 2)
  - `transcribed` - Transcription complete (Phase 2)
  - `extracting` - AI extraction in progress (Phase 3)
  - `extracted` - Data extraction complete (Phase 3)
  - `complete` - Quote created successfully (Phase 5)
  - `failed` - Processing failed at any stage

  ## Notes
  - customer_id is nullable to allow recording before customer assignment
  - transcript and quote_data are nullable for progressive enhancement
  - RLS ensures data isolation between organizations
*/

-- Create the voice_quotes table
CREATE TABLE IF NOT EXISTS voice_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  audio_url TEXT NOT NULL,
  transcript TEXT,
  quote_data JSONB,
  status TEXT NOT NULL DEFAULT 'recorded',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_voice_quote_status CHECK (
    status IN ('recorded', 'transcribing', 'transcribed', 'extracting', 'extracted', 'complete', 'failed')
  )
);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_voice_quotes_org ON voice_quotes(org_id);
CREATE INDEX IF NOT EXISTS idx_voice_quotes_status ON voice_quotes(status);
CREATE INDEX IF NOT EXISTS idx_voice_quotes_created ON voice_quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_quotes_customer ON voice_quotes(customer_id) WHERE customer_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE voice_quotes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can access voice quotes for their organization
CREATE POLICY "Users can access org voice quotes"
  ON voice_quotes
  FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );
/*
  # Add Beta Features: Feedback and Processing Logs

  ## Summary
  1. Create `user_feedback` table for bug reports and feature requests.
  2. Add `debug_log` column to `voice_quotes` for AI observability.
  3. Add performance indexes for faster data retrieval.
*/

-- 1. Create User Feedback table
CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on feedback
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own feedback
CREATE POLICY "Users can see their own feedback"
  ON user_feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own feedback
CREATE POLICY "Users can insert their own feedback"
  ON user_feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2. Add debug_log to voice_quotes
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_quotes' AND column_name = 'debug_log'
  ) THEN
    ALTER TABLE voice_quotes ADD COLUMN debug_log JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 3. Add more performance indexes
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_org_name ON customers(org_id, name);
CREATE INDEX IF NOT EXISTS idx_quote_line_items_quote_id ON quote_line_items(quote_id);

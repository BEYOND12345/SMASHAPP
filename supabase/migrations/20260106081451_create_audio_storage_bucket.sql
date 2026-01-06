-- Create Audio Storage Bucket for Voice Quotes
-- This migration creates the audio bucket and configures RLS policies
-- Bucket: audio (public, 25MB limit, audio/* types)
-- Policies: Users can upload/read/delete files in their org folder

-- Create the audio storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio',
  'audio',
  true,
  26214400,
  ARRAY['audio/*']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload audio to their org folder
CREATE POLICY "Users can upload org audio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'audio' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM users WHERE id = auth.uid()
    )
  );

-- Allow authenticated users to read their org's audio files
CREATE POLICY "Users can read org audio"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'audio' AND
    (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM users WHERE id = auth.uid()
    )
  );

-- Allow users to delete their org's audio files (for cleanup/retry)
CREATE POLICY "Users can delete org audio"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'audio' AND
    (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM users WHERE id = auth.uid()
    )
  );
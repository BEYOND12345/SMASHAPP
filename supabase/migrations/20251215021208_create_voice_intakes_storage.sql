/*
  # Create Voice Intakes Storage Bucket
  
  1. New Storage Bucket
    - `voice-intakes` - Private bucket for audio files
  
  2. Security
    - Users can upload to their own org/user path
    - Users can read their own audio files
    - Edge functions can read all files (for transcription)
*/

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-intakes',
  'voice-intakes',
  false,
  52428800, -- 50MB limit
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Users can upload to their own user folder
CREATE POLICY "Users can upload own voice intakes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'voice-intakes' AND
  (storage.foldername(name))[1] = (
    SELECT org_id::text 
    FROM user_pricing_profiles 
    WHERE user_id = auth.uid() AND is_active = true 
    LIMIT 1
  ) AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy: Users can read their own voice intakes
CREATE POLICY "Users can read own voice intakes"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'voice-intakes' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy: Users can delete their own voice intakes
CREATE POLICY "Users can delete own voice intakes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'voice-intakes' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy: Service role can read all (for edge functions)
CREATE POLICY "Service role can read all voice intakes"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'voice-intakes');
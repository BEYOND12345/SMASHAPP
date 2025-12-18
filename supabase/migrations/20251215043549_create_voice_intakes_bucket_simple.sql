/*
  # Create Voice Intakes Storage Bucket

  1. Storage Setup
    - Creates `voice-intakes` bucket for audio file storage
    - Private bucket (not public)
    - 10MB file size limit
    - Allowed MIME types: audio formats

  2. File Organization
    - Files stored as: {org_id}/{user_id}/voice_intakes/{intake_id}/audio.webm

  Note: Storage RLS policies are managed through Supabase Dashboard for storage buckets
*/

-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-intakes',
  'voice-intakes',
  false,
  10485760, -- 10MB limit
  ARRAY['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/mp4']
)
ON CONFLICT (id) DO NOTHING;
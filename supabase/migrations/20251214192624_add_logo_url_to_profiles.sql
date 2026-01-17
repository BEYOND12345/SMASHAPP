/*
  # Add Logo Support to User Profiles

  1. Changes
    - Add `logo_url` column to `organizations` table
      - Stores the URL/path to the user's uploaded logo or profile picture
      - Nullable to allow profiles without logos
      - Used for branding on invoices and estimates
    
  2. Storage
    - Create `profile-logos` storage bucket for storing user logos
    - Enable RLS on the bucket
    - Add policies for authenticated users to upload/update their own logos
    - Add policy for public read access (so invoices can be viewed publicly)
  
  3. Security
    - Users can only upload/update their own logos
    - Logos are publicly readable (for invoice viewing)
*/

-- Add logo_url column to organizations (used for invoice/estimate branding)
DO $$
BEGIN
  -- On a fresh bootstrap, `organizations` may not exist yet (it is created later).
  -- If it doesn't exist, skip this migration (the canonical schema already includes logo_url).
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) THEN
    ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS logo_url text;
  END IF;
END $$;

-- Create storage bucket for profile logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-logos', 'profile-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on the storage bucket
CREATE POLICY "Users can upload their own logo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-logos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own logo"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-logos' AND
  auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'profile-logos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own logo"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-logos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile-logos');
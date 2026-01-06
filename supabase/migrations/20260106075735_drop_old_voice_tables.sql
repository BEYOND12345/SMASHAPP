/*
  # Drop Old Voice Quote Tables and Functions

  ## Summary
  Complete removal of the old voice-to-quote implementation to prepare for a clean rebuild.
  This migration removes all voice_intakes and quote_generation_jobs infrastructure.

  ## Changes

  ### Tables Dropped
  - `quote_generation_jobs` - Old quote generation job queue
  - `voice_intakes` - Old voice recording intake table

  ### Functions Dropped
  - `lock_voice_intake` - Locking function for voice intake processing (if exists)

  ## Reason
  The old implementation had architectural issues with mixed data flows and conflicting schemas.
  Starting fresh with a cleaner architecture.

  ## Notes
  - Uses CASCADE to automatically drop dependent objects
  - Uses IF EXISTS to safely handle cases where objects may not exist
  - Audio files in storage buckets are preserved (safe to reprocess)
  - Foreign key constraints will be dropped automatically via CASCADE
*/

-- Drop functions first (they may reference tables)
DROP FUNCTION IF EXISTS public.lock_voice_intake(uuid) CASCADE;

-- Drop tables in order (child first, then parent)
-- CASCADE will handle foreign keys, triggers, indexes, constraints, and policies
DROP TABLE IF EXISTS public.quote_generation_jobs CASCADE;
DROP TABLE IF EXISTS public.voice_intakes CASCADE;

-- Note: Storage buckets (voice-intakes) are preserved
-- Audio files can be reprocessed with the new implementation

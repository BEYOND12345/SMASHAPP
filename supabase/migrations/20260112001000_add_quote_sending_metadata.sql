/*
  # Quote sending metadata (intent-first send drawer)

  Adds lightweight fields to track:
  - what intent was chosen (estimate PDF vs approval link)
  - which delivery method was used
  - approval lifecycle (awaiting/approved/rejected)

  This is additive only (no refactors).
*/

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS sent_via text,
  ADD COLUMN IF NOT EXISTS sent_intent text,
  ADD COLUMN IF NOT EXISTS approval_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_status text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Optional guardrails (soft constraints)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_quotes_sent_intent'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT check_quotes_sent_intent
      CHECK (sent_intent IS NULL OR sent_intent IN ('estimate', 'approval'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_quotes_sent_via'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT check_quotes_sent_via
      CHECK (sent_via IS NULL OR sent_via IN ('email', 'sms', 'copy', 'share'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_quotes_approval_status'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT check_quotes_approval_status
      CHECK (approval_status IS NULL OR approval_status IN ('awaiting', 'approved', 'rejected'));
  END IF;
END$$;


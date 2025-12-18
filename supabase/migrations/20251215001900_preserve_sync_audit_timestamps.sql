/*
  # Preserve Sync Audit Timestamps

  ## Problem
  Transitioning synced → pending was clearing synced_at, erasing valuable audit history.
  When disputes arise, you need to know:
  - When did this first sync? (first_synced_at)
  - When did it last successfully sync? (synced_at)

  ## Solution
  Add first_synced_at column and preserve both timestamps across status transitions.

  ## New Column
  - first_synced_at: Set once on first successful sync, never changes
  
  ## Updated Behavior
  - synced_at: Updates every time sync_status moves to 'synced'
  - Both timestamps preserved when moving synced → pending
  - first_synced_at only set if null when moving to 'synced'

  ## Audit Trail
  This enables full sync history tracking for compliance and dispute resolution.
*/

-- Add first_synced_at column
ALTER TABLE integration_entity_map
ADD COLUMN IF NOT EXISTS first_synced_at timestamptz;

-- Update trigger to preserve audit timestamps
CREATE OR REPLACE FUNCTION enforce_sync_status_transitions()
RETURNS TRIGGER AS $$
BEGIN
  -- CRITICAL: Protect identity fields while synced
  IF OLD.sync_status = 'synced' THEN
    -- Block changes to identity fields
    IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'Cannot change org_id on synced mapping';
    END IF;
    
    IF NEW.provider IS DISTINCT FROM OLD.provider THEN
      RAISE EXCEPTION 'Cannot change provider on synced mapping';
    END IF;
    
    IF NEW.entity_type IS DISTINCT FROM OLD.entity_type THEN
      RAISE EXCEPTION 'Cannot change entity_type on synced mapping';
    END IF;
    
    IF NEW.local_id IS DISTINCT FROM OLD.local_id THEN
      RAISE EXCEPTION 'Cannot change local_id on synced mapping';
    END IF;
    
    IF NEW.external_id IS DISTINCT FROM OLD.external_id THEN
      RAISE EXCEPTION 'Cannot change external_id on synced mapping';
    END IF;
    
    -- Preserve audit timestamps when transitioning synced → pending
    -- Do NOT null them out - we need sync history for audits
    IF NEW.sync_status = 'pending' THEN
      NEW.synced_at := OLD.synced_at;
      NEW.first_synced_at := OLD.first_synced_at;
    END IF;
    
    -- Only allow synced → pending transition
    IF NEW.sync_status IS DISTINCT FROM OLD.sync_status AND NEW.sync_status != 'pending' THEN
      RAISE EXCEPTION 'Can only transition from synced to pending';
    END IF;
  END IF;

  -- Validate status transitions (original logic)
  IF NEW.sync_status IS DISTINCT FROM OLD.sync_status THEN
    -- Validate allowed transitions
    IF OLD.sync_status = 'synced' AND NEW.sync_status = 'error' THEN
      RAISE EXCEPTION 'Cannot transition directly from synced to error. Must go through pending.';
    END IF;
    
    IF OLD.sync_status = 'error' AND NEW.sync_status = 'synced' THEN
      RAISE EXCEPTION 'Cannot transition directly from error to synced. Must go through pending first.';
    END IF;
    
    -- Only allow valid statuses
    IF NEW.sync_status NOT IN ('pending', 'synced', 'error') THEN
      RAISE EXCEPTION 'Invalid sync_status: %', NEW.sync_status;
    END IF;
    
    -- Moving to synced: update timestamps
    IF NEW.sync_status = 'synced' THEN
      -- Set first_synced_at only if null (first successful sync)
      IF NEW.first_synced_at IS NULL THEN
        NEW.first_synced_at := now();
      END IF;
      
      -- Always update synced_at to current time (last successful sync)
      NEW.synced_at := now();
    END IF;
    
    -- Moving to error: sync_error must be non-empty
    IF NEW.sync_status = 'error' AND (NEW.sync_error IS NULL OR NEW.sync_error = '') THEN
      RAISE EXCEPTION 'sync_error must be set when moving to error status';
    END IF;
    
    -- Moving to pending: clear sync_error only (preserve timestamps)
    IF NEW.sync_status = 'pending' THEN
      NEW.sync_error := NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
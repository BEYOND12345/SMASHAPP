/*
  # Fix Critical Vulnerability: Synced Mapping Immutability

  ## Problem
  Integration mappings with sync_status='synced' could have identity fields modified,
  breaking accounting references and destroying idempotency guarantees.

  ## Solution
  When a mapping is synced, identity fields become immutable. Only operational
  fields can be updated.

  ## Protected Fields (immutable while synced)
  - org_id
  - provider
  - entity_type
  - local_id (CRITICAL: prevents mapping redirection)
  - external_id (CRITICAL: prevents breaking external system link)
  - synced_at (locked once set)

  ## Allowed Updates While Synced
  - sync_status (only synced → pending transition)
  - sync_token (needed for QuickBooks sync continuity)
  - last_sync_attempt_at
  - sync_error
  - updated_at

  ## Implementation
  Enhanced the existing enforce_sync_status_transitions() trigger to check
  all protected fields when OLD.sync_status = 'synced', regardless of whether
  sync_status itself is changing.
*/

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
    
    -- Block changes to synced_at once set (preserve historical sync timestamp)
    IF NEW.synced_at IS DISTINCT FROM OLD.synced_at AND OLD.synced_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot change synced_at once set';
    END IF;
    
    -- Only allow synced → pending transition (to resync)
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
    
    -- Moving to synced: set synced_at if null
    IF NEW.sync_status = 'synced' AND NEW.synced_at IS NULL THEN
      NEW.synced_at := now();
    END IF;
    
    -- Moving to error: sync_error must be non-empty
    IF NEW.sync_status = 'error' AND (NEW.sync_error IS NULL OR NEW.sync_error = '') THEN
      RAISE EXCEPTION 'sync_error must be set when moving to error status';
    END IF;
    
    -- Moving to pending: clear sync_error
    IF NEW.sync_status = 'pending' THEN
      NEW.sync_error := NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
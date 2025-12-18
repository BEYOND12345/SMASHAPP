/*
  # Fix Trigger Definition to Fire on All Updates

  ## Problem
  The trigger was defined as `BEFORE UPDATE OF sync_status` which only fires
  when sync_status changes. This allowed updates to local_id, external_id, etc.
  to bypass all protection logic.

  ## Solution
  Drop and recreate trigger to fire on ANY update to integration_entity_map.

  ## Implementation
  Change from: BEFORE UPDATE OF sync_status
  Change to: BEFORE UPDATE
*/

DROP TRIGGER IF EXISTS trg_enforce_sync_status_transitions ON integration_entity_map;

CREATE TRIGGER trg_enforce_sync_status_transitions
  BEFORE UPDATE ON integration_entity_map
  FOR EACH ROW
  EXECUTE FUNCTION enforce_sync_status_transitions();
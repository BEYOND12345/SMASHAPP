/*
  # Fix Function Search Paths for Security

  1. Security Improvements
    - Set immutable search_path on all functions to prevent injection attacks
    - Functions affected: all trigger functions, utility functions, and business logic functions
  
  2. Changes
    - Alter all functions to use SET search_path = '' (empty, secure default)
*/

-- Set immutable search_path on all functions (with correct signatures)
ALTER FUNCTION update_material_catalog_updated_at() SET search_path = '';
ALTER FUNCTION lock_voice_intake_for_quote_creation(uuid, uuid) SET search_path = '';
ALTER FUNCTION get_effective_pricing_profile(uuid) SET search_path = '';
ALTER FUNCTION get_public_quote_line_items(uuid) SET search_path = '';
ALTER FUNCTION create_org_and_membership(text, text, text, text, text, numeric) SET search_path = '';
ALTER FUNCTION quote_totals_guard() SET search_path = '';
ALTER FUNCTION update_updated_at_column() SET search_path = '';
ALTER FUNCTION generate_quote_number(uuid) SET search_path = '';
ALTER FUNCTION recalculate_quote_totals(uuid) SET search_path = '';
ALTER FUNCTION quote_line_items_recalc_trigger() SET search_path = '';
ALTER FUNCTION prevent_mutations_after_acceptance() SET search_path = '';
ALTER FUNCTION prevent_line_item_mutations_if_locked() SET search_path = '';
ALTER FUNCTION capture_acceptance_snapshot() SET search_path = '';
ALTER FUNCTION enforce_quote_status_transitions() SET search_path = '';
ALTER FUNCTION enforce_quote_relationship_integrity() SET search_path = '';
ALTER FUNCTION enforce_line_item_org_consistency() SET search_path = '';
ALTER FUNCTION get_public_quote(uuid) SET search_path = '';
ALTER FUNCTION invoice_totals_guard() SET search_path = '';
ALTER FUNCTION invoice_line_items_recalc_trigger() SET search_path = '';
ALTER FUNCTION prevent_invoice_line_item_mutations_if_locked() SET search_path = '';
ALTER FUNCTION prevent_invoice_mutations_after_issued() SET search_path = '';
ALTER FUNCTION check_if_invoice_synced(uuid) SET search_path = '';
ALTER FUNCTION prevent_synced_invoice_mutations() SET search_path = '';
ALTER FUNCTION prevent_synced_invoice_line_item_mutations() SET search_path = '';
ALTER FUNCTION check_if_customer_synced(uuid) SET search_path = '';
ALTER FUNCTION enforce_invoice_status_transitions() SET search_path = '';
ALTER FUNCTION generate_invoice_number(uuid) SET search_path = '';
ALTER FUNCTION create_invoice_from_accepted_quote(uuid) SET search_path = '';
ALTER FUNCTION recalculate_invoice_totals(uuid) SET search_path = '';
ALTER FUNCTION prevent_synced_customer_deletion() SET search_path = '';
ALTER FUNCTION prevent_synced_customer_destructive_changes() SET search_path = '';
ALTER FUNCTION enforce_sync_status_transitions() SET search_path = '';
ALTER FUNCTION encrypt_qb_token(text, uuid) SET search_path = '';
ALTER FUNCTION decrypt_qb_token(text, uuid) SET search_path = '';
ALTER FUNCTION cleanup_expired_oauth_states() SET search_path = '';
ALTER FUNCTION update_user_pricing_profiles_updated_at() SET search_path = '';
ALTER FUNCTION update_voice_intakes_updated_at() SET search_path = '';

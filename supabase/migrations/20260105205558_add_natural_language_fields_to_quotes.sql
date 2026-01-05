/*
  # Add Natural Language Fields to Quotes

  1. Changes
    - Add `site_address` (TEXT, nullable) to store location as user described it
    - Add `timeline_description` (TEXT, nullable) to store timeline in natural language
  
  2. Purpose
    - Support natural voice input capturing exactly what the user said
    - Store "Ocean Shores" instead of formatted addresses
    - Store "2-3 days" instead of calculated date ranges
    - Complements existing structured fields (address_id, job_date)
  
  3. Notes
    - These fields are optional and supplement structured data
    - Used primarily for voice-generated quotes
    - Display layer prioritizes these natural descriptions over structured data
*/

ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS site_address TEXT,
ADD COLUMN IF NOT EXISTS timeline_description TEXT;

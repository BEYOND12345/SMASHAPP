/*
  # Add catalog_item_id to quote_line_items

  1. Changes
    - Add `catalog_item_id` field to quote_line_items to track which catalog item was used
    - This allows us to:
      - Show which materials came from catalog vs manual entry
      - Update prices if catalog gets updated
      - Generate reports on most-used materials
    
  2. Notes
    - Field is nullable since not all line items will come from catalog
    - No foreign key constraint since we don't want quotes to break if catalog items are deleted
*/

-- Add catalog_item_id field to quote_line_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quote_line_items' AND column_name = 'catalog_item_id'
  ) THEN
    ALTER TABLE quote_line_items 
    ADD COLUMN catalog_item_id uuid REFERENCES material_catalog_items(id) ON DELETE SET NULL;
    
    -- Add index for lookups
    CREATE INDEX idx_quote_line_items_catalog_id ON quote_line_items(catalog_item_id) 
    WHERE catalog_item_id IS NOT NULL;
  END IF;
END $$;
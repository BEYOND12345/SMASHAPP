/*
  # Allow Empty Placeholder Customers

  1. Changes
    - Remove the check constraint that requires at least one identifier
    - Allows creating placeholder customers with all null values
    - This is needed for voice-to-quote when no customer data is extracted
  
  2. Rationale
    - Quotes require a customer_id (non-nullable foreign key)
    - Better to have a placeholder customer than to fail the quote creation
    - User can add customer details later when editing the quote
*/

-- Drop the constraint that requires at least one identifier
ALTER TABLE customers 
  DROP CONSTRAINT IF EXISTS customers_has_identifier;

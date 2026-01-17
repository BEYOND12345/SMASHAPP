/*
  # Create Jobs Table for Estimates and Invoices

  1. New Tables
    - `jobs`
      - Core identification
        - `id` (uuid, primary key)
        - `user_id` (uuid, foreign key to user_profiles)
        - `job_number` (text) - User-friendly job reference number
        - `type` (text) - 'estimate' or 'invoice'
        - `status` (text) - 'draft', 'sent', 'approved', 'rejected', 'paid', 'cancelled'
      
      - Client information
        - `client_name` (text)
        - `client_email` (text)
        - `client_phone` (text)
        - `client_address` (text)
      
      - Job details
        - `job_title` (text)
        - `job_description` (text)
        - `job_date` (date) - When work is/was performed
        - `due_date` (date) - Payment due date
      
      - Line items (stored as JSONB arrays)
        - `labor_items` (jsonb) - [{description, hours, rate, total}]
        - `material_items` (jsonb) - [{description, quantity, cost, markup, total}]
      
      - Rate snapshot (from profile at time of creation)
        - `hourly_rate` (numeric)
        - `day_rate` (numeric)
        - `weekend_rate` (numeric)
        - `travel_rate` (numeric)
        - `material_markup` (numeric)
        - `currency` (text)
      
      - Payment info snapshot (from profile at time of creation)
        - `payment_terms` (text)
        - `bank_name` (text)
        - `account_name` (text)
        - `bsb_routing` (text)
        - `account_number` (text)
        - `payment_instructions` (text)
      
      - Calculated totals
        - `labor_subtotal` (numeric)
        - `materials_subtotal` (numeric)
        - `tax_rate` (numeric) - Percentage (e.g., 10 for 10%)
        - `tax_amount` (numeric)
        - `total_amount` (numeric)
      
      - Public sharing
        - `share_token` (text, unique) - For public estimate/invoice viewing
        - `is_public` (boolean) - Whether shareable via public link
      
      - Timestamps
        - `created_at` (timestamptz)
        - `updated_at` (timestamptz)
        - `sent_at` (timestamptz) - When sent to client
        - `paid_at` (timestamptz) - When payment received

  2. Security
    - Enable RLS on `jobs` table
    - Authenticated users can view/create/update/delete their own jobs
    - Public users can view jobs with valid share_token if is_public is true

  3. Indexes
    - Index on user_id for fast user job queries
    - Index on share_token for fast public lookups
    - Index on status for filtering
    - Index on created_at for sorting
*/

-- Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Use auth.users so this migration can run before app tables are created.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Job identification
  job_number text NOT NULL,
  type text NOT NULL DEFAULT 'estimate',
  status text NOT NULL DEFAULT 'draft',
  
  -- Client info
  client_name text NOT NULL,
  client_email text,
  client_phone text,
  client_address text,
  
  -- Job details
  job_title text NOT NULL,
  job_description text,
  job_date date,
  due_date date,
  
  -- Line items
  labor_items jsonb DEFAULT '[]'::jsonb,
  material_items jsonb DEFAULT '[]'::jsonb,
  
  -- Rate snapshot
  hourly_rate numeric DEFAULT 0,
  day_rate numeric DEFAULT 0,
  weekend_rate numeric DEFAULT 0,
  travel_rate numeric DEFAULT 0,
  material_markup numeric DEFAULT 10.0,
  currency text DEFAULT 'USD',
  
  -- Payment info snapshot
  payment_terms text,
  bank_name text,
  account_name text,
  bsb_routing text,
  account_number text,
  payment_instructions text,
  
  -- Totals
  labor_subtotal numeric DEFAULT 0,
  materials_subtotal numeric DEFAULT 0,
  tax_rate numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  
  -- Public sharing
  share_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_public boolean DEFAULT false,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  paid_at timestamptz,
  
  -- Constraints
  CONSTRAINT valid_type CHECK (type IN ('estimate', 'invoice')),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'paid', 'cancelled')),
  CONSTRAINT unique_job_number_per_user UNIQUE (user_id, job_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_share_token ON jobs(share_token);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);

-- Enable RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
CREATE POLICY "Users can view their own jobs"
  ON jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own jobs"
  ON jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs"
  ON jobs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own jobs"
  ON jobs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policy for public viewing (via share token)
CREATE POLICY "Public can view shared jobs"
  ON jobs
  FOR SELECT
  TO public
  USING (is_public = true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
-- Add manual billing credentials to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vodafone_cash_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS instapay_address TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_account_details JSONB DEFAULT '{}';

-- Create lawyer_availability table for explicit scheduling rules
CREATE TABLE IF NOT EXISTS lawyer_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  available_days TEXT[] DEFAULT ARRAY['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
  time_slots TEXT[] DEFAULT ARRAY['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT lawyer_availability_lawyer_id_key UNIQUE (lawyer_id)
);

-- Enable RLS on lawyer_availability
ALTER TABLE lawyer_availability ENABLE ROW LEVEL SECURITY;

-- Lawyer availability RLS policies
CREATE POLICY "select_own_availability" ON lawyer_availability FOR SELECT TO authenticated USING (lawyer_id = auth.uid());
CREATE POLICY "update_own_availability" ON lawyer_availability FOR UPDATE TO authenticated USING (lawyer_id = auth.uid());
CREATE POLICY "insert_own_availability" ON lawyer_availability FOR INSERT TO authenticated WITH CHECK (lawyer_id = auth.uid());

-- Add sender_role to messages for role-based signing
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_role TEXT DEFAULT 'lawyer';

-- Add alternative_time to appointment_requests for rescheduling
ALTER TABLE appointment_requests ADD COLUMN IF NOT EXISTS alternative_time TEXT;
ALTER TABLE appointment_requests ADD COLUMN IF NOT EXISTS responded_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE appointment_requests ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- Enable realtime for lawyer_availability
ALTER PUBLICATION supabase_realtime ADD TABLE lawyer_availability;

-- Create index for lawyer_availability lookups
CREATE INDEX IF NOT EXISTS idx_lawyer_availability_lawyer_id ON lawyer_availability(lawyer_id);

-- Update appointment_requests status check to include 'accepted'
ALTER TABLE appointment_requests DROP CONSTRAINT IF EXISTS appointment_requests_status_check;
ALTER TABLE appointment_requests ADD CONSTRAINT appointment_requests_status_check CHECK (status IN ('pending', 'accepted', 'confirmed', 'rejected'));
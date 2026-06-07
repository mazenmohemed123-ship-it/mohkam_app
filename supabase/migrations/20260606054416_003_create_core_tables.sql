-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone_number TEXT,
  role TEXT NOT NULL DEFAULT 'lawyer' CHECK (role IN ('owner', 'partner', 'lawyer', 'assistant', 'secretary', 'accountant', 'client')),
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium', 'team')),
  office_address TEXT,
  avatar_url TEXT,
  bio TEXT,
  is_emergency_enabled BOOLEAN DEFAULT TRUE,
  linked_lawyer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  device_fingerprint TEXT UNIQUE,
  fcm_token TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles RLS policies
CREATE POLICY "select_own_profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Create cases table
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL,
  client_name TEXT,
  client_phone TEXT,
  case_type TEXT,
  judgment TEXT DEFAULT 'قيد الانتظار',
  total_fees NUMERIC DEFAULT 0,
  admin_fees NUMERIC DEFAULT 0,
  lawyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on cases
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

-- Cases RLS policies
CREATE POLICY "select_lawyer_cases" ON cases FOR SELECT TO authenticated USING (lawyer_id = auth.uid() OR client_id = auth.uid());
CREATE POLICY "insert_lawyer_cases" ON cases FOR INSERT TO authenticated WITH CHECK (lawyer_id = auth.uid());
CREATE POLICY "update_lawyer_cases" ON cases FOR UPDATE TO authenticated USING (lawyer_id = auth.uid());
CREATE POLICY "delete_lawyer_cases" ON cases FOR DELETE TO authenticated USING (lawyer_id = auth.uid());

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Messages RLS policies
CREATE POLICY "select_case_messages" ON messages FOR SELECT TO authenticated USING (
  case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid() OR client_id = auth.uid())
);
CREATE POLICY "insert_case_messages" ON messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());
CREATE POLICY "update_own_messages" ON messages FOR UPDATE TO authenticated USING (sender_id = auth.uid());

-- Create case_events table
CREATE TABLE IF NOT EXISTS case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on case_events
ALTER TABLE case_events ENABLE ROW LEVEL SECURITY;

-- Case events RLS policies
CREATE POLICY "select_case_events" ON case_events FOR SELECT TO authenticated USING (
  case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid() OR client_id = auth.uid())
);
CREATE POLICY "insert_case_events" ON case_events FOR INSERT TO authenticated WITH CHECK (
  case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid() OR client_id = auth.uid())
);

-- Create case_emergencies table
CREATE TABLE IF NOT EXISTS case_emergencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  essential_needs TEXT,
  emergency_costs NUMERIC DEFAULT 0,
  needs_status TEXT DEFAULT 'عاجل',
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on case_emergencies
ALTER TABLE case_emergencies ENABLE ROW LEVEL SECURITY;

-- Case emergencies RLS policies
CREATE POLICY "select_case_emergencies" ON case_emergencies FOR SELECT TO authenticated USING (
  case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid() OR client_id = auth.uid())
);
CREATE POLICY "insert_case_emergencies" ON case_emergencies FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "update_case_emergencies" ON case_emergencies FOR UPDATE TO authenticated USING (
  case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid())
);

-- Create appointment_requests table
CREATE TABLE IF NOT EXISTS appointment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lawyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  appointment_date TEXT NOT NULL,
  appointment_time TEXT,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on appointment_requests
ALTER TABLE appointment_requests ENABLE ROW LEVEL SECURITY;

-- Appointment requests RLS policies
CREATE POLICY "select_appointment_requests" ON appointment_requests FOR SELECT TO authenticated USING (
  lawyer_id = auth.uid() OR client_id = auth.uid()
);
CREATE POLICY "insert_appointment_requests" ON appointment_requests FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());
CREATE POLICY "update_appointment_requests" ON appointment_requests FOR UPDATE TO authenticated USING (lawyer_id = auth.uid());

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE cases;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE case_emergencies;
ALTER PUBLICATION supabase_realtime ADD TABLE appointment_requests;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cases_lawyer_id ON cases(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_cases_client_phone ON cases(client_phone);
CREATE INDEX IF NOT EXISTS idx_messages_case_id ON messages(case_id);
CREATE INDEX IF NOT EXISTS idx_case_emergencies_case_id ON case_emergencies(case_id);
CREATE INDEX IF NOT EXISTS idx_appointment_requests_lawyer_id ON appointment_requests(lawyer_id);
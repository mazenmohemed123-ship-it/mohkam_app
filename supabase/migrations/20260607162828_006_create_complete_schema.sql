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
  master_lawyer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  can_view_billing BOOLEAN DEFAULT false,
  can_manage_appointments BOOLEAN DEFAULT true,
  vodafone_cash_number TEXT,
  instapay_address TEXT,
  bank_account_details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_lawyer_cases" ON cases FOR SELECT TO authenticated 
  USING (lawyer_id = auth.uid() OR client_id = auth.uid() OR lawyer_id IN (SELECT id FROM profiles WHERE master_lawyer_id = auth.uid()));
CREATE POLICY "insert_lawyer_cases" ON cases FOR INSERT TO authenticated 
  WITH CHECK (lawyer_id = auth.uid() OR lawyer_id IN (SELECT id FROM profiles WHERE master_lawyer_id = auth.uid()));
CREATE POLICY "update_lawyer_cases" ON cases FOR UPDATE TO authenticated 
  USING (lawyer_id = auth.uid() OR lawyer_id IN (SELECT id FROM profiles WHERE master_lawyer_id = auth.uid()));
CREATE POLICY "delete_lawyer_cases" ON cases FOR DELETE TO authenticated USING (lawyer_id = auth.uid());

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_role TEXT DEFAULT 'lawyer',
  message_text TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_case_messages" ON messages FOR SELECT TO authenticated USING (
  case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid() OR client_id = auth.uid() OR lawyer_id IN (SELECT id FROM profiles WHERE master_lawyer_id = auth.uid()))
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

ALTER TABLE case_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_case_events" ON case_events FOR SELECT TO authenticated USING (
  case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid() OR client_id = auth.uid())
);
CREATE POLICY "insert_case_events" ON case_events FOR INSERT TO authenticated WITH CHECK (
  case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid())
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

ALTER TABLE case_emergencies ENABLE ROW LEVEL SECURITY;

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
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  feedback TEXT,
  alternative_time TEXT,
  responded_by UUID REFERENCES profiles(id),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appointment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_appointment_requests" ON appointment_requests FOR SELECT TO authenticated USING (
  lawyer_id = auth.uid() OR client_id = auth.uid() OR lawyer_id IN (SELECT id FROM profiles WHERE master_lawyer_id = auth.uid())
);
CREATE POLICY "insert_appointment_requests" ON appointment_requests FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());
CREATE POLICY "update_appointment_requests" ON appointment_requests FOR UPDATE TO authenticated 
  USING (lawyer_id = auth.uid() OR lawyer_id IN (SELECT id FROM profiles WHERE master_lawyer_id = auth.uid()));

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER DEFAULT 0,
  storage_path TEXT NOT NULL,
  download_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_case_documents" ON documents FOR SELECT TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid() OR client_id = auth.uid()));
CREATE POLICY "insert_case_documents" ON documents FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "delete_case_documents" ON documents FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

-- Create lawyer_availability table
CREATE TABLE IF NOT EXISTS lawyer_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  available_days TEXT[] DEFAULT ARRAY['saturday','sunday','monday','tuesday','wednesday','thursday'],
  time_slots TEXT[] DEFAULT ARRAY['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'],
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lawyer_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_lawyer_availability" ON lawyer_availability FOR SELECT TO authenticated
  USING (lawyer_id IN (SELECT id FROM profiles WHERE master_lawyer_id = auth.uid()) OR lawyer_id = auth.uid() OR lawyer_id IN (SELECT linked_lawyer_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "insert_lawyer_availability" ON lawyer_availability FOR INSERT TO authenticated
  WITH CHECK (lawyer_id = auth.uid());
CREATE POLICY "update_lawyer_availability" ON lawyer_availability FOR UPDATE TO authenticated
  USING (lawyer_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE cases;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE case_emergencies;
ALTER PUBLICATION supabase_realtime ADD TABLE appointment_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE documents;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cases_lawyer_id ON cases(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_cases_client_phone ON cases(client_phone);
CREATE INDEX IF NOT EXISTS idx_messages_case_id ON messages(case_id);
CREATE INDEX IF NOT EXISTS idx_case_emergencies_case_id ON case_emergencies(case_id);
CREATE INDEX IF NOT EXISTS idx_appointment_requests_lawyer_id ON appointment_requests(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_profiles_master_lawyer ON profiles(master_lawyer_id);

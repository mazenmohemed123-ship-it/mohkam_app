-- Add missing columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Add 'owner' to profiles role check
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('owner','partner','lawyer','assistant','secretary','accountant','client'));

-- Add is_deleted to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add metadata to case_events
ALTER TABLE case_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add lawyer_id to appointment_requests
ALTER TABLE appointment_requests ADD COLUMN IF NOT EXISTS lawyer_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE appointment_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT DEFAULT 0,
  storage_path TEXT,
  download_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Documents RLS policies
CREATE POLICY "select_case_documents" ON documents FOR SELECT TO authenticated USING (
  case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid() OR client_id = auth.uid())
);
CREATE POLICY "insert_case_documents" ON documents FOR INSERT TO authenticated WITH CHECK (
  uploaded_by = auth.uid()
);
CREATE POLICY "delete_case_documents" ON documents FOR DELETE TO authenticated USING (
  case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid())
);

-- Add missing RLS policy for profile inserts
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
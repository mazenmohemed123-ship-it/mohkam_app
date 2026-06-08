-- Add commission_debt column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commission_debt NUMERIC DEFAULT 0;

-- Create function to increment commission debt
CREATE OR REPLACE FUNCTION increment_commission_debt(amount NUMERIC, lawyer_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET commission_debt = COALESCE(commission_debt, 0) + amount
  WHERE id = lawyer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add attachment columns to messages for media support
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT;

-- Add sender_role to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_role TEXT DEFAULT 'lawyer';

-- Create index for messages queries
CREATE INDEX IF NOT EXISTS idx_messages_case_created ON messages(case_id, created_at DESC);

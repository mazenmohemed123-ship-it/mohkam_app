-- Add auto-renewal toggle to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_auto_renew_enabled BOOLEAN DEFAULT false;

-- Add admin control columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 5;

-- Create index for admin queries
CREATE INDEX IF NOT EXISTS idx_profiles_tier ON profiles(tier);
CREATE INDEX IF NOT EXISTS idx_profiles_is_frozen ON profiles(is_frozen);
CREATE INDEX IF NOT EXISTS idx_profiles_commission_debt ON profiles(commission_debt);

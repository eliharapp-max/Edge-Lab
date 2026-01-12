-- Add missing columns to user_profiles
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS welcome_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Update pin_reset_tokens to use token_hash instead of token (for consistency)
-- Note: If token column already exists with hashed values, this migration handles it
-- The Edge Function stores hashed tokens, so we keep the column name as 'token' but it contains hashes


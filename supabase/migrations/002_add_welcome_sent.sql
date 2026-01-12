-- Add welcome_sent column to user_profiles table
-- This column tracks whether the welcome email has been sent to the user
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS welcome_sent BOOLEAN NOT NULL DEFAULT FALSE;


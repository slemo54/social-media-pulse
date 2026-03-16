-- Add config column to data_sources if it doesn't already exist.
-- This is needed for storing OAuth tokens (e.g. SoundCloud access_token).
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS config jsonb;

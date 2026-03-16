-- Add config column to data_sources for storing OAuth tokens and other credentials
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}';

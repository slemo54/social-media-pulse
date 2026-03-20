-- ============================================================
-- Sync Jobs — Playwright-based manual sync job queue
-- ============================================================

CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  log JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  raw_data JSONB,
  records_synced INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_jobs_platform_status ON sync_jobs(platform, status);
CREATE INDEX idx_sync_jobs_created_at ON sync_jobs(created_at DESC);

-- RLS
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sync_jobs"
  ON sync_jobs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert sync_jobs"
  ON sync_jobs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Service role full access on sync_jobs"
  ON sync_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add apple_podcasts to data_sources (if not exists)
INSERT INTO data_sources (platform, display_name, is_active)
VALUES ('apple_podcasts', 'Apple Podcasts', true)
ON CONFLICT (platform) DO NOTHING;

-- ============================================================
-- Social Media Pulse — Initial Schema
-- ============================================================

-- Table: daily_aggregates
CREATE TABLE daily_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  date date NOT NULL,
  downloads int,
  views int,
  sessions int,
  listeners int,
  watch_time_minutes float,
  likes int,
  comments int,
  shares int,
  subscribers_gained int,
  page_views int,
  avg_session_duration float,
  bounce_rate float,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (platform, date)
);

-- Table: episodes
CREATE TABLE episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  audio_url text,
  duration_seconds int,
  publish_date date,
  series text,
  tags text[],
  external_ids jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table: episode_metrics
CREATE TABLE episode_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid REFERENCES episodes(id) ON DELETE CASCADE,
  platform text NOT NULL,
  external_id text,
  date date NOT NULL,
  downloads int,
  views int,
  likes int,
  comments int,
  watch_time_minutes float,
  created_at timestamptz DEFAULT now(),
  UNIQUE (episode_id, platform, date)
);

-- Table: data_sources
CREATE TABLE data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text UNIQUE NOT NULL,
  api_key_configured boolean DEFAULT false,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  records_synced int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed data_sources
INSERT INTO data_sources (platform) VALUES
  ('megaphone'),
  ('youtube'),
  ('ga4'),
  ('soundcloud');

-- Table: sync_logs
CREATE TABLE sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  sync_type text NOT NULL,
  status text NOT NULL,
  records_count int DEFAULT 0,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_daily_aggregates_date ON daily_aggregates(date);
CREATE INDEX idx_daily_aggregates_platform ON daily_aggregates(platform);
CREATE INDEX idx_episodes_publish_date ON episodes(publish_date);
CREATE INDEX idx_episode_metrics_date ON episode_metrics(date);

-- ============================================================
-- Row Level Security
-- ============================================================

-- daily_aggregates
ALTER TABLE daily_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read daily_aggregates"
  ON daily_aggregates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert daily_aggregates"
  ON daily_aggregates FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update daily_aggregates"
  ON daily_aggregates FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete daily_aggregates"
  ON daily_aggregates FOR DELETE
  TO service_role
  USING (true);

-- episodes
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read episodes"
  ON episodes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert episodes"
  ON episodes FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update episodes"
  ON episodes FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete episodes"
  ON episodes FOR DELETE
  TO service_role
  USING (true);

-- episode_metrics
ALTER TABLE episode_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read episode_metrics"
  ON episode_metrics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert episode_metrics"
  ON episode_metrics FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update episode_metrics"
  ON episode_metrics FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete episode_metrics"
  ON episode_metrics FOR DELETE
  TO service_role
  USING (true);

-- data_sources
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read data_sources"
  ON data_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert data_sources"
  ON data_sources FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update data_sources"
  ON data_sources FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete data_sources"
  ON data_sources FOR DELETE
  TO service_role
  USING (true);

-- sync_logs
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sync_logs"
  ON sync_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert sync_logs"
  ON sync_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update sync_logs"
  ON sync_logs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete sync_logs"
  ON sync_logs FOR DELETE
  TO service_role
  USING (true);

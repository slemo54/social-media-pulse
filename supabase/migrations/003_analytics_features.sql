-- Migration: Add analytics features (goals, annotations, episode tags)

-- Add tags column to episodes table
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Create goals table
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  target_value numeric NOT NULL,
  period text NOT NULL CHECK (period IN ('monthly', 'quarterly')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create annotations table
CREATE TABLE IF NOT EXISTS annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  note text NOT NULL,
  category text NOT NULL CHECK (category IN ('event', 'campaign', 'guest', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

-- RLS policies for goals (authenticated users only)
CREATE POLICY "goals_select" ON goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "goals_insert" ON goals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "goals_update" ON goals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "goals_delete" ON goals FOR DELETE TO authenticated USING (true);

-- RLS policies for annotations
CREATE POLICY "annotations_select" ON annotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "annotations_insert" ON annotations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "annotations_update" ON annotations FOR UPDATE TO authenticated USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "annotations_delete" ON annotations FOR DELETE TO authenticated USING (auth.uid() = user_id OR user_id IS NULL);

-- Indexes
CREATE INDEX IF NOT EXISTS goals_metric_name_idx ON goals(metric_name);
CREATE INDEX IF NOT EXISTS goals_period_idx ON goals(period);
CREATE INDEX IF NOT EXISTS annotations_date_idx ON annotations(date);
CREATE INDEX IF NOT EXISTS annotations_category_idx ON annotations(category);
CREATE INDEX IF NOT EXISTS episodes_tags_idx ON episodes USING GIN(tags);

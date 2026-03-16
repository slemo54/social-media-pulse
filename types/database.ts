export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      daily_aggregates: {
        Row: {
          id: string;
          platform: string;
          date: string;
          total_downloads: number | null;
          unique_listeners: number | null;
          total_views: number | null;
          total_watch_time: number | null;
          pageviews: number | null;
          sessions: number | null;
          users: number | null;
          bounce_rate: number | null;
          avg_completion_rate: number | null;
          raw_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform: string;
          date: string;
          total_downloads?: number | null;
          unique_listeners?: number | null;
          total_views?: number | null;
          total_watch_time?: number | null;
          pageviews?: number | null;
          sessions?: number | null;
          users?: number | null;
          bounce_rate?: number | null;
          avg_completion_rate?: number | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform?: string;
          date?: string;
          total_downloads?: number | null;
          unique_listeners?: number | null;
          total_views?: number | null;
          total_watch_time?: number | null;
          pageviews?: number | null;
          sessions?: number | null;
          users?: number | null;
          bounce_rate?: number | null;
          avg_completion_rate?: number | null;
          raw_data?: Json | null;
          created_at?: string;
        };
      };
      episodes: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          series: string | null;
          tags: string[] | null;
          pub_date: string | null;
          audio_url: string | null;
          image_url: string | null;
          duration: number | null;
          external_id: string | null;
          rss_guid: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          series?: string | null;
          tags?: string[] | null;
          pub_date?: string | null;
          audio_url?: string | null;
          image_url?: string | null;
          duration?: number | null;
          external_id?: string | null;
          rss_guid?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          series?: string | null;
          tags?: string[] | null;
          pub_date?: string | null;
          audio_url?: string | null;
          image_url?: string | null;
          duration?: number | null;
          external_id?: string | null;
          rss_guid?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      episode_metrics: {
        Row: {
          episode_id: string;
          platform: string;
          external_id: string | null;
          date: string;
          downloads: number | null;
          views: number | null;
          likes: number | null;
          comments: number | null;
          watch_time_minutes: number | null;
        };
        Insert: {
          episode_id: string;
          platform: string;
          external_id?: string | null;
          date: string;
          downloads?: number | null;
          views?: number | null;
          likes?: number | null;
          comments?: number | null;
          watch_time_minutes?: number | null;
        };
        Update: {
          episode_id?: string;
          platform?: string;
          external_id?: string | null;
          date?: string;
          downloads?: number | null;
          views?: number | null;
          likes?: number | null;
          comments?: number | null;
          watch_time_minutes?: number | null;
        };
      };
      data_sources: {
        Row: {
          platform: string;
          display_name: string | null;
          is_active: boolean;
          config: Json | null;
          last_sync_at: string | null;
          last_sync_status: string | null;
          last_sync_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          platform: string;
          display_name?: string | null;
          is_active?: boolean;
          config?: Json | null;
          last_sync_at?: string | null;
          last_sync_status?: string | null;
          last_sync_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          platform?: string;
          display_name?: string | null;
          is_active?: boolean;
          config?: Json | null;
          last_sync_at?: string | null;
          last_sync_status?: string | null;
          last_sync_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      sync_logs: {
        Row: {
          id: string;
          platform: string;
          sync_type: string;
          status: string;
          records_synced: number;
          error_message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          platform: string;
          sync_type: string;
          status: string;
          records_synced?: number;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          platform?: string;
          sync_type?: string;
          status?: string;
          records_synced?: number;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
      };
      goals: {
        Row: {
          id: string;
          metric_name: string;
          target_value: number;
          period: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          metric_name: string;
          target_value: number;
          period: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          metric_name?: string;
          target_value?: number;
          period?: string;
          created_at?: string;
        };
      };
      annotations: {
        Row: {
          id: string;
          date: string;
          note: string;
          category: string;
          created_at: string;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          date: string;
          note: string;
          category: string;
          created_at?: string;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          date?: string;
          note?: string;
          category?: string;
          created_at?: string;
          user_id?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

export type DailyAggregate =
  Database["public"]["Tables"]["daily_aggregates"]["Row"];
export type Episode = Database["public"]["Tables"]["episodes"]["Row"];
export type EpisodeMetric =
  Database["public"]["Tables"]["episode_metrics"]["Row"];
export type DataSource = Database["public"]["Tables"]["data_sources"]["Row"];
export type SyncLog = Database["public"]["Tables"]["sync_logs"]["Row"];
export type Goal = Database["public"]["Tables"]["goals"]["Row"];
export type Annotation = Database["public"]["Tables"]["annotations"]["Row"];

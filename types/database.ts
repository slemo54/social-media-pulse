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
          downloads: number | null;
          views: number | null;
          sessions: number | null;
          listeners: number | null;
          watch_time_minutes: number | null;
          likes: number | null;
          comments: number | null;
          shares: number | null;
          subscribers_gained: number | null;
          page_views: number | null;
          avg_session_duration: number | null;
          bounce_rate: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          platform: string;
          date: string;
          downloads?: number | null;
          views?: number | null;
          sessions?: number | null;
          listeners?: number | null;
          watch_time_minutes?: number | null;
          likes?: number | null;
          comments?: number | null;
          shares?: number | null;
          subscribers_gained?: number | null;
          page_views?: number | null;
          avg_session_duration?: number | null;
          bounce_rate?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          platform?: string;
          date?: string;
          downloads?: number | null;
          views?: number | null;
          sessions?: number | null;
          listeners?: number | null;
          watch_time_minutes?: number | null;
          likes?: number | null;
          comments?: number | null;
          shares?: number | null;
          subscribers_gained?: number | null;
          page_views?: number | null;
          avg_session_duration?: number | null;
          bounce_rate?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      episodes: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          audio_url: string | null;
          duration_seconds: number | null;
          publish_date: string | null;
          series: string | null;
          tags: string[] | null;
          external_ids: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          audio_url?: string | null;
          duration_seconds?: number | null;
          publish_date?: string | null;
          series?: string | null;
          tags?: string[] | null;
          external_ids?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          audio_url?: string | null;
          duration_seconds?: number | null;
          publish_date?: string | null;
          series?: string | null;
          tags?: string[] | null;
          external_ids?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      episode_metrics: {
        Row: {
          id: string;
          episode_id: string;
          platform: string;
          external_id: string | null;
          date: string;
          downloads: number | null;
          views: number | null;
          likes: number | null;
          comments: number | null;
          watch_time_minutes: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          episode_id: string;
          platform: string;
          external_id?: string | null;
          date: string;
          downloads?: number | null;
          views?: number | null;
          likes?: number | null;
          comments?: number | null;
          watch_time_minutes?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          episode_id?: string;
          platform?: string;
          external_id?: string | null;
          date?: string;
          downloads?: number | null;
          views?: number | null;
          likes?: number | null;
          comments?: number | null;
          watch_time_minutes?: number | null;
          created_at?: string;
        };
      };
      data_sources: {
        Row: {
          id: string;
          platform: string;
          api_key_configured: boolean;
          last_sync_at: string | null;
          last_sync_status: string | null;
          last_sync_error: string | null;
          records_synced: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          platform: string;
          api_key_configured?: boolean;
          last_sync_at?: string | null;
          last_sync_status?: string | null;
          last_sync_error?: string | null;
          records_synced?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          platform?: string;
          api_key_configured?: boolean;
          last_sync_at?: string | null;
          last_sync_status?: string | null;
          last_sync_error?: string | null;
          records_synced?: number;
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
          records_count: number;
          error_message: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          platform: string;
          sync_type: string;
          status: string;
          records_count?: number;
          error_message?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          platform?: string;
          sync_type?: string;
          status?: string;
          records_count?: number;
          error_message?: string | null;
          started_at?: string;
          completed_at?: string | null;
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

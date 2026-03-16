export interface NormalizedDailyAggregate {
  platform: string;
  date: string; // YYYY-MM-DD
  downloads?: number;
  views?: number;
  sessions?: number;
  listeners?: number;
  watch_time_minutes?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  subscribers_gained?: number;
  page_views?: number;
  avg_session_duration?: number;
  bounce_rate?: number;
}

export interface NormalizedEpisodeMetric {
  platform: string;
  external_id: string;
  episode_title: string;
  date: string;
  downloads?: number;
  views?: number;
  likes?: number;
  comments?: number;
  watch_time_minutes?: number;
}

export interface PlatformConnector {
  platform: string;
  fetchDailyAggregates(
    startDate: string,
    endDate: string
  ): Promise<NormalizedDailyAggregate[]>;
  fetchEpisodeMetrics?(
    startDate: string,
    endDate: string
  ): Promise<NormalizedEpisodeMetric[]>;
}

export function getConnector(
  platform: string,
  config?: Record<string, string>
): PlatformConnector {
  switch (platform) {
    case "megaphone":
      return new (require("./megaphone").MegaphoneConnector)();
    case "youtube":
      return new (require("./youtube").YouTubeConnector)();
    case "ga4":
      return new (require("./ga4").GA4Connector)();
    case "soundcloud":
      return new (require("./soundcloud").SoundCloudConnector)(
        config?.access_token
      );
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

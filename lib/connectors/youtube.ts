import type {
  PlatformConnector,
  NormalizedDailyAggregate,
  NormalizedEpisodeMetric,
} from "./types";

interface YouTubeTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface YouTubeAnalyticsRow {
  [index: number]: string | number;
}

interface YouTubeAnalyticsResponse {
  rows?: YouTubeAnalyticsRow[];
  columnHeaders?: { name: string }[];
}

interface YouTubeVideoItem {
  id: { videoId: string };
  snippet: { title: string; publishedAt: string };
}

interface YouTubeSearchResponse {
  items: YouTubeVideoItem[];
  nextPageToken?: string;
}

export class YouTubeConnector implements PlatformConnector {
  platform = "youtube";

  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private channelIds: string[];
  private apiKey: string;
  private config?: Record<string, any>;

  constructor(config?: Record<string, any>) {
    this.clientId = process.env.YOUTUBE_CLIENT_ID || "";
    this.clientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";
    this.refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN || "";
    this.apiKey = process.env.YOUTUBE_API_KEY || "";
    this.config = config;

    // Support multiple channel IDs from config, with fallback to env var
    const configChannelIds = config?.channelIds || [];
    const envChannelId = process.env.YOUTUBE_CHANNEL_ID || "";
    this.channelIds = [
      ...configChannelIds,
      ...(envChannelId ? [envChannelId] : []),
    ].filter((id) => id); // Remove duplicates and empty strings

    console.log("YouTube connector initialized:", {
      hasClientId: !!this.clientId,
      hasClientSecret: !!this.clientSecret,
      hasRefreshToken: !!this.refreshToken,
      channelCount: this.channelIds.length,
      channelIds: this.channelIds,
      hasApiKey: !!this.apiKey,
    });
  }

  private async getAccessToken(): Promise<string> {
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`YouTube token refresh failed: ${response.status} ${errorText}`);
      }

      const data: YouTubeTokenResponse = await response.json();
      return data.access_token;
    } catch (error) {
      console.error("Failed to refresh YouTube access token:", error);
      throw error;
    }
  }

  async fetchDailyAggregates(
    startDate: string,
    endDate: string
  ): Promise<NormalizedDailyAggregate[]> {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      console.warn(
        "YouTube OAuth credentials not configured (need YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_OAUTH_REFRESH_TOKEN), returning empty results"
      );
      return [];
    }

    if (this.channelIds.length === 0) {
      console.warn("No YouTube channel IDs configured, returning empty results");
      return [];
    }

    try {
      const accessToken = await this.getAccessToken();
      const allAggregates: NormalizedDailyAggregate[] = [];

      // Fetch analytics for each channel and aggregate by date
      for (const channelId of this.channelIds) {
        try {
          const params = new URLSearchParams({
            ids: `channel==${channelId}`,
            startDate,
            endDate,
            metrics:
              "views,estimatedMinutesWatched,likes,comments,shares,subscribersGained",
            dimensions: "day",
            sort: "day",
          });

          const response = await fetch(
            `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.warn(`YouTube Analytics API error for channel ${channelId}:`, {
              status: response.status,
              body: errorText,
            });
            continue; // Skip this channel on error
          }

          const data: YouTubeAnalyticsResponse = await response.json();

          if (data.rows && data.rows.length > 0) {
            // Column order: day, views, estimatedMinutesWatched, likes, comments, shares, subscribersGained
            allAggregates.push(
              ...data.rows.map((row) => ({
                platform: this.platform,
                date: String(row[0]),
                views: Number(row[1]) || 0,
                watch_time_minutes: Number(row[2]) || 0,
                likes: Number(row[3]) || 0,
                comments: Number(row[4]) || 0,
                shares: Number(row[5]) || 0,
                subscribers_gained: Number(row[6]) || 0,
              }))
            );
          }
        } catch (error) {
          console.warn(`Failed to fetch analytics for channel ${channelId}:`, error);
          continue;
        }
      }

      // Aggregate by date (sum across all channels)
      const aggregatesByDate = new Map<string, NormalizedDailyAggregate>();

      for (const agg of allAggregates) {
        const existing = aggregatesByDate.get(agg.date);
        if (existing) {
          aggregatesByDate.set(agg.date, {
            ...existing,
            views: (existing.views || 0) + (agg.views || 0),
            watch_time_minutes:
              (existing.watch_time_minutes || 0) + (agg.watch_time_minutes || 0),
            likes: (existing.likes || 0) + (agg.likes || 0),
            comments: (existing.comments || 0) + (agg.comments || 0),
            shares: (existing.shares || 0) + (agg.shares || 0),
            subscribers_gained:
              (existing.subscribers_gained || 0) + (agg.subscribers_gained || 0),
          });
        } else {
          aggregatesByDate.set(agg.date, agg);
        }
      }

      return Array.from(aggregatesByDate.values());
    } catch (error) {
      console.error("YouTube fetchDailyAggregates failed:", error);
      throw error;
    }
  }

  async fetchEpisodeMetrics(
    startDate: string,
    endDate: string
  ): Promise<NormalizedEpisodeMetric[]> {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      console.warn(
        "YouTube OAuth credentials not configured (need YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_OAUTH_REFRESH_TOKEN), returning empty results"
      );
      return [];
    }

    if (this.channelIds.length === 0) {
      console.warn("No YouTube channel IDs configured, returning empty results");
      return [];
    }

    try {
      const accessToken = await this.getAccessToken();
      const metrics: NormalizedEpisodeMetric[] = [];

      // Fetch videos from all channels
      for (const channelId of this.channelIds) {
        try {
          const videos = await this.fetchChannelVideos(accessToken, channelId);

          for (const video of videos) {
            try {
              const videoMetrics = await this.fetchVideoAnalytics(
                accessToken,
                video.id.videoId,
                startDate,
                endDate,
                channelId
              );

              for (const row of videoMetrics) {
                metrics.push({
                  platform: this.platform,
                  external_id: video.id.videoId,
                  episode_title: video.snippet.title,
                  date: String(row[0]),
                  views: Number(row[1]) || 0,
                  likes: Number(row[2]) || 0,
                  comments: Number(row[3]) || 0,
                  watch_time_minutes: Number(row[4]) || 0,
                });
              }
            } catch (error) {
              console.warn(
                `Failed to fetch analytics for video ${video.id.videoId}:`,
                error
              );
            }
          }
        } catch (error) {
          console.warn(
            `Failed to fetch videos for channel ${channelId}:`,
            error
          );
        }
      }

      return metrics.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    } catch (error) {
      console.error("YouTube fetchEpisodeMetrics failed:", error);
      throw error;
    }
  }

  private async fetchChannelVideos(
    accessToken: string,
    channelId: string
  ): Promise<YouTubeVideoItem[]> {
    const videos: YouTubeVideoItem[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        part: "snippet",
        channelId,
        type: "video",
        maxResults: "50",
        order: "date",
      });
      if (pageToken) params.set("pageToken", pageToken);

      // Data API supports API key auth as fallback
      if (this.apiKey) {
        params.set("key", this.apiKey);
      }

      const headers: Record<string, string> = accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {};

      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${params}`,
        { headers }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("YouTube Data API search error:", {
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
          channelId,
        });
        throw new Error(
          `YouTube Data API error: ${response.status} ${response.statusText} — ${errorBody}`
        );
      }

      const data: YouTubeSearchResponse = await response.json();
      videos.push(...(data.items || []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    return videos;
  }

  private async fetchVideoAnalytics(
    accessToken: string,
    videoId: string,
    startDate: string,
    endDate: string,
    channelId: string
  ): Promise<YouTubeAnalyticsRow[]> {
    const params = new URLSearchParams({
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      metrics: "views,likes,comments,estimatedMinutesWatched",
      dimensions: "day",
      sort: "day",
      filters: `video==${videoId}`,
    });

    const response = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("YouTube Analytics per-video error:", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        videoId,
        channelId,
      });
      throw new Error(
        `YouTube Analytics per-video error: ${response.status} ${response.statusText} — ${errorBody}`
      );
    }

    const data: YouTubeAnalyticsResponse = await response.json();
    return data.rows || [];
  }
}

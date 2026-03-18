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
  private channelId: string;
  private apiKey: string;

  constructor() {
    this.clientId = process.env.YOUTUBE_CLIENT_ID || "";
    this.clientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";
    this.refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN || "";
    this.channelId = process.env.YOUTUBE_CHANNEL_ID || "";
    this.apiKey = process.env.YOUTUBE_API_KEY || "";

    console.log("YouTube connector initialized:", {
      hasClientId: !!this.clientId,
      hasClientSecret: !!this.clientSecret,
      hasRefreshToken: !!this.refreshToken,
      hasChannelId: !!this.channelId,
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

    try {
      const accessToken = await this.getAccessToken();

      const params = new URLSearchParams({
        ids: `channel==${this.channelId}`,
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
        console.error("YouTube Analytics API error response:", { status: response.status, body: errorText });
        throw new Error(
          `YouTube Analytics API error: ${response.status} ${response.statusText} — ${errorText}`
        );
      }

      const data: YouTubeAnalyticsResponse = await response.json();

      if (!data.rows || data.rows.length === 0) {
        return [];
      }

      // Column order: day, views, estimatedMinutesWatched, likes, comments, shares, subscribersGained
      return data.rows.map((row) => ({
        platform: this.platform,
        date: String(row[0]),
        views: Number(row[1]) || 0,
        watch_time_minutes: Number(row[2]) || 0,
        likes: Number(row[3]) || 0,
        comments: Number(row[4]) || 0,
        shares: Number(row[5]) || 0,
        subscribers_gained: Number(row[6]) || 0,
      }));
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

    try {
      const accessToken = await this.getAccessToken();

      // Get channel videos
      const videos = await this.fetchChannelVideos(accessToken);
      const metrics: NormalizedEpisodeMetric[] = [];

      for (const video of videos) {
        try {
          const videoMetrics = await this.fetchVideoAnalytics(
            accessToken,
            video.id.videoId,
            startDate,
            endDate
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

      return metrics.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    } catch (error) {
      console.error("YouTube fetchEpisodeMetrics failed:", error);
      throw error;
    }
  }

  private async fetchChannelVideos(
    accessToken: string
  ): Promise<YouTubeVideoItem[]> {
    const videos: YouTubeVideoItem[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        part: "snippet",
        channelId: this.channelId,
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
          url: `https://www.googleapis.com/youtube/v3/search?${params}`,
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
    endDate: string
  ): Promise<YouTubeAnalyticsRow[]> {
    const params = new URLSearchParams({
      ids: `channel==${this.channelId}`,
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
      });
      throw new Error(
        `YouTube Analytics per-video error: ${response.status} ${response.statusText} — ${errorBody}`
      );
    }

    const data: YouTubeAnalyticsResponse = await response.json();
    return data.rows || [];
  }
}

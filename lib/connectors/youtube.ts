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

interface VideoInfo {
  videoId: string;
  title: string;
  publishedAt: string;
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
  }

  private async getAccessToken(): Promise<string> {
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
      throw new Error(
        `YouTube token refresh failed: ${response.status} — ${errorText.slice(0, 300)}`
      );
    }

    const data: YouTubeTokenResponse = await response.json();
    return data.access_token;
  }

  async fetchDailyAggregates(
    startDate: string,
    endDate: string
  ): Promise<NormalizedDailyAggregate[]> {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error(
        "YouTube OAuth not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_OAUTH_REFRESH_TOKEN."
      );
    }

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
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `YouTube Analytics API error: ${response.status} ${response.statusText} — ${errorText.slice(0, 300)}`
      );
    }

    const data: YouTubeAnalyticsResponse = await response.json();

    if (!data.rows || data.rows.length === 0) {
      console.log("[YouTube] No analytics rows for the requested period");
      return [];
    }

    console.log(`[YouTube] Got ${data.rows.length} daily aggregate rows`);

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
  }

  async fetchEpisodeMetrics(
    startDate: string,
    endDate: string
  ): Promise<NormalizedEpisodeMetric[]> {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error(
        "YouTube OAuth not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_OAUTH_REFRESH_TOKEN."
      );
    }

    const accessToken = await this.getAccessToken();
    const videos = await this.fetchChannelVideos();
    const metrics: NormalizedEpisodeMetric[] = [];

    // Process videos in series to avoid quota burst
    for (const video of videos) {
      try {
        const videoMetrics = await this.fetchVideoAnalytics(
          accessToken,
          video.videoId,
          startDate,
          endDate
        );

        for (const row of videoMetrics) {
          metrics.push({
            platform: this.platform,
            external_id: video.videoId,
            episode_title: video.title,
            date: String(row[0]),
            views: Number(row[1]) || 0,
            likes: Number(row[2]) || 0,
            comments: Number(row[3]) || 0,
            watch_time_minutes: Number(row[4]) || 0,
          });
        }
      } catch (error) {
        console.warn(
          `[YouTube] Failed analytics for video ${video.videoId}:`,
          error
        );
      }
    }

    console.log(
      `[YouTube] Fetched episode metrics: ${metrics.length} rows for ${videos.length} videos`
    );

    return metrics.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  /**
   * Fetch channel videos using the uploads playlist (costs 1 quota unit per
   * page vs 100 for search). Falls back to search API if playlist fetch fails.
   */
  private async fetchChannelVideos(): Promise<VideoInfo[]> {
    try {
      // Step 1: Get the uploads playlist ID
      const channelParams = new URLSearchParams({
        part: "contentDetails",
        id: this.channelId,
        key: this.apiKey,
      });

      const channelRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?${channelParams}`
      );

      if (!channelRes.ok) {
        throw new Error(`Channel lookup failed: ${channelRes.status}`);
      }

      const channelData = await channelRes.json();
      const uploadsPlaylistId =
        channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

      if (!uploadsPlaylistId) {
        throw new Error("Could not determine uploads playlist ID");
      }

      // Step 2: Fetch all playlist items
      const videos: VideoInfo[] = [];
      let pageToken: string | undefined;

      do {
        const params = new URLSearchParams({
          part: "snippet",
          playlistId: uploadsPlaylistId,
          maxResults: "50",
          key: this.apiKey,
        });
        if (pageToken) params.set("pageToken", pageToken);

        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?${params}`
        );

        if (!res.ok) {
          const body = await res.text();
          throw new Error(
            `PlaylistItems error: ${res.status} — ${body.slice(0, 200)}`
          );
        }

        const data = await res.json();
        for (const item of data.items || []) {
          videos.push({
            videoId: item.snippet.resourceId.videoId,
            title: item.snippet.title,
            publishedAt: item.snippet.publishedAt,
          });
        }
        pageToken = data.nextPageToken;
      } while (pageToken);

      console.log(`[YouTube] Found ${videos.length} videos via uploads playlist`);
      return videos;
    } catch (error) {
      console.warn(
        "[YouTube] Playlist-based fetch failed, falling back to search API:",
        error
      );
      return this.fetchChannelVideosViaSearch();
    }
  }

  private async fetchChannelVideosViaSearch(): Promise<VideoInfo[]> {
    const videos: VideoInfo[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        part: "snippet",
        channelId: this.channelId,
        type: "video",
        maxResults: "50",
        order: "date",
        key: this.apiKey,
      });
      if (pageToken) params.set("pageToken", pageToken);

      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${params}`
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `YouTube search API error: ${response.status} ${response.statusText} — ${errorBody.slice(0, 200)}`
        );
      }

      const data = await response.json();
      for (const item of data.items || []) {
        videos.push({
          videoId: item.id.videoId,
          title: item.snippet.title,
          publishedAt: item.snippet.publishedAt,
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    console.log(`[YouTube] Found ${videos.length} videos via search API`);
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
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `YouTube Analytics per-video error: ${response.status} — ${errorBody.slice(0, 200)}`
      );
    }

    const data: YouTubeAnalyticsResponse = await response.json();
    return data.rows || [];
  }
}

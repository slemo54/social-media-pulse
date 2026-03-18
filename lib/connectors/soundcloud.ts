import type {
  PlatformConnector,
  NormalizedDailyAggregate,
  NormalizedEpisodeMetric,
} from "./types";

interface SoundCloudTrack {
  id: number;
  title: string;
  playback_count: number | null;
  likes_count: number | null;
  comment_count: number | null;
  reposts_count: number | null;
  created_at: string;
  permalink_url: string;
  duration: number; // milliseconds
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

export class SoundCloudConnector implements PlatformConnector {
  platform = "soundcloud";

  private clientId: string;
  private clientSecret: string;
  private userId: string;
  private accessTokenOverride: string;

  constructor(accessTokenOverride?: string) {
    this.clientId = process.env.SOUNDCLOUD_CLIENT_ID || "";
    this.clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET || "";
    this.userId = process.env.SOUNDCLOUD_USER_ID || "";
    this.accessTokenOverride = accessTokenOverride || process.env.SOUNDCLOUD_ACCESS_TOKEN || "";
  }

  /**
   * Get an access token. Prefers an existing token, falls back to
   * client_credentials OAuth flow.
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessTokenOverride && this.accessTokenOverride.length > 10) {
      return this.accessTokenOverride;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "SoundCloud not configured. Set SOUNDCLOUD_CLIENT_ID and SOUNDCLOUD_CLIENT_SECRET, or provide SOUNDCLOUD_ACCESS_TOKEN."
      );
    }

    console.log("[SoundCloud] Obtaining token via client_credentials flow");

    const response = await fetch("https://api.soundcloud.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "client_credentials",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `SoundCloud OAuth error: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`
      );
    }

    const data: TokenResponse = await response.json();
    console.log("[SoundCloud] Token obtained successfully");
    return data.access_token;
  }

  /**
   * Fetch all tracks for the configured user. Handles pagination.
   */
  private async fetchAllTracks(token: string): Promise<SoundCloudTrack[]> {
    const allTracks: SoundCloudTrack[] = [];
    let nextUrl: string | null = `https://api.soundcloud.com/users/${this.userId}/tracks?limit=200&linked_partitioning=1`;

    while (nextUrl) {
      const res: Response = await fetch(nextUrl, {
        headers: {
          Authorization: `OAuth ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error(
            "SoundCloud authentication failed — token expired or invalid"
          );
        }
        const body = await res.text();
        throw new Error(
          `SoundCloud API error: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`
        );
      }

      const body = await res.json();

      if (Array.isArray(body)) {
        allTracks.push(...body);
        nextUrl = null;
      } else {
        allTracks.push(...(body.collection || []));
        nextUrl = body.next_href || null;
      }
    }

    console.log(`[SoundCloud] Fetched ${allTracks.length} tracks total`);
    return allTracks;
  }

  async fetchDailyAggregates(
    startDate: string,
    endDate: string
  ): Promise<NormalizedDailyAggregate[]> {
    if (!this.userId) {
      throw new Error(
        "SoundCloud not configured. Set SOUNDCLOUD_USER_ID environment variable."
      );
    }

    const token = await this.getAccessToken();
    const tracks = await this.fetchAllTracks(token);

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Group tracks by publication date
    const dayMap = new Map<string, { plays: number; tracks: number }>();

    for (const track of tracks) {
      if (!track.created_at) continue;
      // SoundCloud dates are like "2026/03/12 09:03:58 +0000"
      const trackDate = new Date(track.created_at);
      if (trackDate < start || trackDate > end) continue;

      const dateStr = trackDate.toISOString().split("T")[0];
      const existing = dayMap.get(dateStr) || { plays: 0, tracks: 0 };
      existing.plays += track.playback_count || 0;
      existing.tracks += 1;
      dayMap.set(dateStr, existing);
    }

    // Also produce a summary entry with total playback count if we have data
    const totalPlays = tracks.reduce(
      (sum, t) => sum + (t.playback_count || 0),
      0
    );

    const aggregates: NormalizedDailyAggregate[] = [];

    if (dayMap.size > 0) {
      dayMap.forEach(({ plays }, date) => {
        aggregates.push({
          platform: this.platform,
          date,
          listeners: plays,
        });
      });
    } else if (totalPlays > 0) {
      // Fallback: single summary entry at end date
      aggregates.push({
        platform: this.platform,
        date: endDate,
        listeners: totalPlays,
      });
    }

    console.log(
      `[SoundCloud] ${aggregates.length} daily aggregates, total plays across all tracks: ${totalPlays}`
    );

    return aggregates.sort((a, b) => a.date.localeCompare(b.date));
  }

  async fetchEpisodeMetrics(
    startDate: string,
    endDate: string
  ): Promise<NormalizedEpisodeMetric[]> {
    if (!this.userId) {
      throw new Error(
        "SoundCloud not configured. Set SOUNDCLOUD_USER_ID environment variable."
      );
    }

    const token = await this.getAccessToken();
    const tracks = await this.fetchAllTracks(token);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const metrics: NormalizedEpisodeMetric[] = [];

    for (const track of tracks) {
      if (!track.created_at) continue;
      const trackDate = new Date(track.created_at);
      if (trackDate < start || trackDate > end) continue;

      metrics.push({
        platform: this.platform,
        external_id: String(track.id),
        episode_title: track.title,
        date: trackDate.toISOString().split("T")[0],
        views: track.playback_count || 0,
      });
    }

    return metrics.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }
}

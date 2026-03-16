import type {
  PlatformConnector,
  NormalizedDailyAggregate,
  NormalizedEpisodeMetric,
} from "./types";

interface SoundCloudTrack {
  id: number;
  title: string;
  playback_count: number;
  created_at: string;
  permalink_url: string;
}

export class SoundCloudConnector implements PlatformConnector {
  platform = "soundcloud";

  private clientId: string;
  private clientSecret: string;
  private accessToken: string;

  constructor() {
    this.clientId = process.env.SOUNDCLOUD_CLIENT_ID || "";
    this.clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET || "";
    this.accessToken = process.env.SOUNDCLOUD_ACCESS_TOKEN || "";
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `OAuth ${this.accessToken}`,
      Accept: "application/json",
    };
  }

  private async fetchTracks(): Promise<SoundCloudTrack[]> {
    const allTracks: SoundCloudTrack[] = [];
    let url: string | null =
      "https://api.soundcloud.com/me/tracks?limit=200";

    while (url) {
      const res: Response = await fetch(url, { headers: this.headers });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error(
            "SoundCloud authentication failed — check SOUNDCLOUD_ACCESS_TOKEN"
          );
        }
        throw new Error(
          `SoundCloud API error: ${res.status} ${res.statusText}`
        );
      }

      const body = (await res.json()) as
        | SoundCloudTrack[]
        | { collection: SoundCloudTrack[]; next_href?: string };
      if (Array.isArray(body)) {
        allTracks.push(...body);
        url = null;
      } else {
        allTracks.push(...(body.collection || []));
        url = body.next_href || null;
      }
    }

    return allTracks;
  }

  async fetchDailyAggregates(
    startDate: string,
    endDate: string
  ): Promise<NormalizedDailyAggregate[]> {
    if (!this.accessToken || this.accessToken === "xxxxxxxx" || this.accessToken.length < 10) {
      console.warn(
        "SoundCloud credentials not configured or placeholder token detected, returning empty results"
      );
      return [];
    }

    try {
      const tracks = await this.fetchTracks();

      // SoundCloud's public API doesn't provide daily breakdowns natively.
      // We aggregate total playback counts across all tracks, grouped
      // by the track creation date if it falls within the requested range.
      // For a more granular daily breakdown, the SoundCloud Pro analytics
      // API would be needed.
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Aggregate total plays as a single snapshot for the date range
      let totalListeners = 0;
      for (const track of tracks) {
        totalListeners += track.playback_count || 0;
      }

      // Create daily entries — distribute as a single aggregate for the
      // end date since SoundCloud doesn't give per-day data via public API
      const aggregates: NormalizedDailyAggregate[] = [];

      // Generate an entry per day in the range using available data
      const current = new Date(start);
      while (current <= end) {
        const dateStr = current.toISOString().split("T")[0];

        // Count tracks that were published on this specific date
        const tracksOnDate = tracks.filter((t) => {
          const trackDate = new Date(t.created_at)
            .toISOString()
            .split("T")[0];
          return trackDate === dateStr;
        });

        if (tracksOnDate.length > 0) {
          const dayListeners = tracksOnDate.reduce(
            (sum, t) => sum + (t.playback_count || 0),
            0
          );

          aggregates.push({
            platform: this.platform,
            date: dateStr,
            listeners: dayListeners,
          });
        }

        current.setDate(current.getDate() + 1);
      }

      // If no per-day data was found, return a single summary entry
      if (aggregates.length === 0 && totalListeners > 0) {
        aggregates.push({
          platform: this.platform,
          date: endDate,
          listeners: totalListeners,
        });
      }

      return aggregates;
    } catch (error) {
      console.error("SoundCloud fetchDailyAggregates failed:", error);
      throw error;
    }
  }

  async fetchEpisodeMetrics(
    startDate: string,
    endDate: string
  ): Promise<NormalizedEpisodeMetric[]> {
    if (!this.accessToken || this.accessToken === "xxxxxxxx" || this.accessToken.length < 10) {
      console.warn(
        "SoundCloud credentials not configured or placeholder token detected, returning empty results"
      );
      return [];
    }

    try {
      const tracks = await this.fetchTracks();
      const start = new Date(startDate);
      const end = new Date(endDate);

      const metrics: NormalizedEpisodeMetric[] = [];

      for (const track of tracks) {
        const trackDate = new Date(track.created_at);

        // Only include tracks within the date range
        if (trackDate >= start && trackDate <= end) {
          metrics.push({
            platform: this.platform,
            external_id: String(track.id),
            episode_title: track.title,
            date: trackDate.toISOString().split("T")[0],
            views: track.playback_count || 0,
          });
        }
      }

      return metrics.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    } catch (error) {
      console.error("SoundCloud fetchEpisodeMetrics failed:", error);
      throw error;
    }
  }
}

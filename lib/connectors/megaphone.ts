import type {
  PlatformConnector,
  NormalizedDailyAggregate,
  NormalizedEpisodeMetric,
} from "./types";

interface MegaphoneEpisode {
  id: string;
  uid: string;
  title: string;
  pubdate: string;
}

interface MegaphoneDownloadStat {
  date: string;
  downloads: number;
}

const MEGAPHONE_BASE_URL = "https://cms.megaphone.fm/api";

export class MegaphoneConnector implements PlatformConnector {
  platform = "megaphone";

  private apiKey: string;
  private networkId: string;
  private podcastId: string;

  constructor() {
    this.apiKey = process.env.MEGAPHONE_API_KEY || "";
    this.networkId = process.env.MEGAPHONE_NETWORK_ID || "";
    this.podcastId = process.env.MEGAPHONE_PODCAST_ID || "";
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Token token=${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async fetchEpisodes(): Promise<MegaphoneEpisode[]> {
    try {
      const url = `${MEGAPHONE_BASE_URL}/networks/${this.networkId}/podcasts/${this.podcastId}/episodes`;
      const response = await fetch(url, { headers: this.headers });

      if (!response.ok) {
        throw new Error(
          `Megaphone episodes API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return Array.isArray(data) ? data : data.episodes || [];
    } catch (error) {
      console.error("Failed to fetch Megaphone episodes:", error);
      throw error;
    }
  }

  async fetchDailyAggregates(
    startDate: string,
    endDate: string
  ): Promise<NormalizedDailyAggregate[]> {
    if (!this.apiKey || !this.networkId || !this.podcastId) {
      throw new Error(
        "Megaphone not configured. Set MEGAPHONE_API_KEY, MEGAPHONE_NETWORK_ID, and MEGAPHONE_PODCAST_ID environment variables."
      );
    }

    try {
      const url = `${MEGAPHONE_BASE_URL}/networks/${this.networkId}/podcasts/${this.podcastId}/download_stats?startDate=${startDate}&endDate=${endDate}`;
      const response = await fetch(url, { headers: this.headers });

      if (!response.ok) {
        throw new Error(
          `Megaphone Analytics API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const rows: MegaphoneDownloadStat[] = Array.isArray(data)
        ? data
        : data.stats || [];

      return rows.map((row) => ({
        platform: this.platform,
        date: row.date,
        downloads: row.downloads || 0,
      }));
    } catch (error) {
      console.error("Megaphone fetchDailyAggregates failed:", error);
      throw error;
    }
  }

  async fetchEpisodeMetrics(
    startDate: string,
    endDate: string
  ): Promise<NormalizedEpisodeMetric[]> {
    if (!this.apiKey || !this.networkId || !this.podcastId) {
      throw new Error(
        "Megaphone not configured. Set MEGAPHONE_API_KEY, MEGAPHONE_NETWORK_ID, and MEGAPHONE_PODCAST_ID environment variables."
      );
    }

    try {
      const episodes = await this.fetchEpisodes();
      const metrics: NormalizedEpisodeMetric[] = [];

      for (const episode of episodes) {
        try {
          const url = `${MEGAPHONE_BASE_URL}/networks/${this.networkId}/podcasts/${this.podcastId}/episodes/${episode.id}/download_stats?startDate=${startDate}&endDate=${endDate}`;
          const response = await fetch(url, { headers: this.headers });

          if (!response.ok) {
            console.warn(
              `Failed to fetch download stats for episode ${episode.id}: ${response.status}`
            );
            continue;
          }

          const data = await response.json();
          const rows: MegaphoneDownloadStat[] = Array.isArray(data)
            ? data
            : data.stats || [];

          for (const row of rows) {
            metrics.push({
              platform: this.platform,
              external_id: episode.id,
              episode_title: episode.title,
              date: row.date,
              downloads: row.downloads || 0,
            });
          }
        } catch (err) {
          console.warn(
            `Failed to fetch metrics for episode ${episode.id}:`,
            err
          );
        }
      }

      return metrics.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    } catch (error) {
      console.error("Megaphone fetchEpisodeMetrics failed:", error);
      throw error;
    }
  }
}

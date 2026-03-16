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

interface MegaphoneStat {
  date: string;
  downloads: number;
}

const MEGAPHONE_BASE_URL = "https://cms.megaphone.fm/api";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      const url = `${MEGAPHONE_BASE_URL}/search/episodes?networkId=${this.networkId}&podcastId=${this.podcastId}`;
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

  private async fetchEpisodeStats(
    episodeId: string,
    startDate: string,
    endDate: string
  ): Promise<MegaphoneStat[]> {
    try {
      const url = `${MEGAPHONE_BASE_URL}/episodes/${episodeId}/stats?startDate=${startDate}&endDate=${endDate}`;
      const response = await fetch(url, { headers: this.headers });

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited — wait and retry once
          await delay(2000);
          const retryResponse = await fetch(url, { headers: this.headers });
          if (!retryResponse.ok) {
            console.warn(
              `Megaphone stats rate limited for episode ${episodeId}, skipping`
            );
            return [];
          }
          return retryResponse.json();
        }
        throw new Error(
          `Megaphone stats API error: ${response.status} ${response.statusText}`
        );
      }

      return response.json();
    } catch (error) {
      console.error(
        `Failed to fetch stats for episode ${episodeId}:`,
        error
      );
      return [];
    }
  }

  async fetchDailyAggregates(
    startDate: string,
    endDate: string
  ): Promise<NormalizedDailyAggregate[]> {
    if (!this.apiKey || !this.networkId || !this.podcastId) {
      console.warn(
        "Megaphone credentials not configured, returning empty results"
      );
      return [];
    }

    try {
      const episodes = await this.fetchEpisodes();
      const dailyMap = new Map<string, number>();

      for (const episode of episodes) {
        const stats = await this.fetchEpisodeStats(
          episode.uid || episode.id,
          startDate,
          endDate
        );

        for (const stat of stats) {
          const existing = dailyMap.get(stat.date) || 0;
          dailyMap.set(stat.date, existing + (stat.downloads || 0));
        }

        // Rate limit delay between episodes
        await delay(200);
      }

      const aggregates: NormalizedDailyAggregate[] = [];
      dailyMap.forEach((downloads, date) => {
        aggregates.push({
          platform: this.platform,
          date,
          downloads,
        });
      });

      return aggregates.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
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
      console.warn(
        "Megaphone credentials not configured, returning empty results"
      );
      return [];
    }

    try {
      const episodes = await this.fetchEpisodes();
      const metrics: NormalizedEpisodeMetric[] = [];

      for (const episode of episodes) {
        const episodeId = episode.uid || episode.id;
        const stats = await this.fetchEpisodeStats(
          episodeId,
          startDate,
          endDate
        );

        for (const stat of stats) {
          metrics.push({
            platform: this.platform,
            external_id: episodeId,
            episode_title: episode.title,
            date: stat.date,
            downloads: stat.downloads || 0,
          });
        }

        await delay(200);
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

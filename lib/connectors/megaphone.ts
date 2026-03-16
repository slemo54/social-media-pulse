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

  async fetchDailyAggregates(
    _startDate: string,
    _endDate: string
  ): Promise<NormalizedDailyAggregate[]> {
    if (!this.apiKey || !this.networkId || !this.podcastId) {
      console.warn(
        "Megaphone credentials not configured, returning empty results"
      );
      return [];
    }

    // Megaphone CMS API does not expose a stats/analytics endpoint.
    // Daily aggregate downloads are not available via this API.
    console.warn(
      "Megaphone CMS API does not provide analytics — returning empty daily aggregates"
    );
    return [];
  }

  async fetchEpisodeMetrics(
    _startDate: string,
    _endDate: string
  ): Promise<NormalizedEpisodeMetric[]> {
    if (!this.apiKey || !this.networkId || !this.podcastId) {
      console.warn(
        "Megaphone credentials not configured, returning empty results"
      );
      return [];
    }

    // Megaphone CMS API does not expose per-episode stats.
    // Episode-level metrics are not available via this API.
    console.warn(
      "Megaphone CMS API does not provide episode metrics — returning empty results"
    );
    return [];
  }
}

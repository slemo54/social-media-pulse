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
  duration: number | null;
  externalId: string | null;
  downloadUrl: string | null;
  status: string;
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

  private async fetchAllEpisodes(): Promise<MegaphoneEpisode[]> {
    const url = `${MEGAPHONE_BASE_URL}/networks/${this.networkId}/podcasts/${this.podcastId}/episodes`;
    console.log(`[Megaphone] Fetching episodes from: ${url}`);

    const response = await fetch(url, { headers: this.headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Megaphone episodes API error: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`
      );
    }

    const data = await response.json();
    const episodes: MegaphoneEpisode[] = Array.isArray(data) ? data : data.episodes || [];
    console.log(`[Megaphone] Fetched ${episodes.length} episodes`);
    return episodes;
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

    // Megaphone's public API does not expose download stats endpoints.
    // We aggregate episode publication dates to provide a "content output"
    // timeline which is meaningful alongside data from other platforms.
    const episodes = await this.fetchAllEpisodes();

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Count episodes published per day in the range
    const dayMap = new Map<string, number>();

    for (const ep of episodes) {
      if (!ep.pubdate || ep.status === "draft") continue;
      const pubDate = new Date(ep.pubdate);
      if (pubDate < start || pubDate > end) continue;
      const dateStr = pubDate.toISOString().split("T")[0];
      dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + 1);
    }

    const aggregates: NormalizedDailyAggregate[] = [];
    dayMap.forEach((count, date) => {
      aggregates.push({
        platform: this.platform,
        date,
        downloads: count, // episodes published on this day
      });
    });

    console.log(
      `[Megaphone] Generated ${aggregates.length} daily aggregates (episode publication counts)`
    );

    return aggregates.sort((a, b) => a.date.localeCompare(b.date));
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

    const episodes = await this.fetchAllEpisodes();
    const start = new Date(startDate);
    const end = new Date(endDate);
    const metrics: NormalizedEpisodeMetric[] = [];

    for (const ep of episodes) {
      if (!ep.pubdate || ep.status === "draft") continue;
      const pubDate = new Date(ep.pubdate);
      if (pubDate < start || pubDate > end) continue;

      metrics.push({
        platform: this.platform,
        external_id: ep.id,
        episode_title: ep.title,
        date: pubDate.toISOString().split("T")[0],
      });
    }

    return metrics.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }
}

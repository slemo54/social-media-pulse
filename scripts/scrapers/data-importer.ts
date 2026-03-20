import {
  createRunnerClient,
  appendJobLog,
  type ScrapeResult,
  type ScrapedEpisodeData,
} from "./base-scraper";

// ---------------------------------------------------------------------------
// Import scraped data into Supabase
// ---------------------------------------------------------------------------
export async function importScrapedData(
  jobId: string,
  platform: string,
  result: ScrapeResult
): Promise<number> {
  const supabase = createRunnerClient();
  let totalRecords = 0;

  // ---- 1. Store raw_data on the job for audit ----
  await supabase
    .from("sync_jobs")
    .update({
      raw_data: {
        source: "playwright_scrape",
        scraped_at: result.scrapedAt,
        page_url: result.pageUrl,
        data_quality: "scraped",
        daily_count: result.daily.length,
        episodes_count: result.episodes.length,
        daily: result.daily,
        episodes: result.episodes,
      },
    } as never)
    .eq("id", jobId);

  // ---- 2. Upsert daily aggregates ----
  if (result.daily.length > 0) {
    await appendJobLog(jobId, `Importing ${result.daily.length} daily aggregate records...`);

    for (let i = 0; i < result.daily.length; i += 50) {
      const chunk = result.daily.slice(i, i + 50);
      const rows = chunk.map((d) => ({
        platform,
        date: d.date,
        total_downloads: d.downloads ?? null,
        total_views: d.plays ?? d.downloads ?? null,
        unique_listeners: d.listeners ?? null,
        raw_data: {
          source: "playwright_scrape",
          data_quality: "scraped",
          page_url: result.pageUrl,
          scraped_at: result.scrapedAt,
          engaged_listeners: d.engaged_listeners ?? null,
          followers: d.followers ?? null,
          ...d.raw,
        },
      }));

      const { error } = await supabase
        .from("daily_aggregates")
        .upsert(rows as never[], { onConflict: "platform,date" });

      if (error) {
        await appendJobLog(jobId, `Error upserting daily aggregates: ${error.message}`);
        throw error;
      }
      totalRecords += chunk.length;
    }

    await appendJobLog(jobId, `Imported ${totalRecords} daily records`);
  }

  // ---- 3. Match and upsert episode metrics ----
  if (result.episodes.length > 0) {
    await appendJobLog(jobId, `Matching ${result.episodes.length} episodes...`);

    // Fetch all existing episodes for matching
    const { data: existingEpisodes } = await supabase
      .from("episodes")
      .select("id, title, external_id, pub_date");

    const episodes = (existingEpisodes || []) as Array<{
      id: string;
      title: string;
      external_id: string | null;
      pub_date: string | null;
    }>;

    let matched = 0;
    let unmatched = 0;

    for (const scraped of result.episodes) {
      const match = findBestMatch(scraped, episodes, platform);

      if (match) {
        const metricDate = scraped.date || new Date().toISOString().split("T")[0];

        const row = {
          episode_id: match.id,
          platform,
          external_id: scraped.external_id || null,
          date: metricDate,
          downloads: scraped.downloads ?? null,
          views: scraped.plays ?? null,
          likes: null,
          comments: null,
          watch_time_minutes: scraped.avg_consumption ?? null,
        };

        const { error } = await supabase
          .from("episode_metrics")
          .upsert(row as never, { onConflict: "episode_id,platform,date" });

        if (error) {
          console.warn(`Failed to upsert metric for "${scraped.title}": ${error.message}`);
        } else {
          matched++;
          totalRecords++;
        }
      } else {
        unmatched++;
        console.warn(`No match for scraped episode: "${scraped.title}"`);
      }
    }

    await appendJobLog(
      jobId,
      `Episode matching: ${matched} matched, ${unmatched} unmatched`
    );
  }

  // ---- 4. Update data_sources ----
  await supabase
    .from("data_sources")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "success",
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("platform", platform);

  // ---- 5. Create sync_logs entry ----
  await supabase.from("sync_logs").insert({
    platform,
    sync_type: "playwright_scrape",
    status: "success",
    records_synced: totalRecords,
    completed_at: new Date().toISOString(),
  } as never);

  return totalRecords;
}

// ---------------------------------------------------------------------------
// Episode matching logic
// ---------------------------------------------------------------------------
function findBestMatch(
  scraped: ScrapedEpisodeData,
  episodes: Array<{
    id: string;
    title: string;
    external_id: string | null;
    pub_date: string | null;
  }>,
  platform: string
): { id: string } | null {
  // Strategy 1: Match by external_id (most reliable)
  if (scraped.external_id) {
    const byExtId = episodes.find((e) => e.external_id === scraped.external_id);
    if (byExtId) return { id: byExtId.id };
  }

  // Strategy 2: Exact title match (case-insensitive)
  const normalizedTitle = normalizeTitle(scraped.title);
  const exactMatch = episodes.find(
    (e) => normalizeTitle(e.title) === normalizedTitle
  );
  if (exactMatch) return { id: exactMatch.id };

  // Strategy 3: Fuzzy title match (one title contains the other)
  const containsMatch = episodes.find((e) => {
    const eNorm = normalizeTitle(e.title);
    return (
      eNorm.includes(normalizedTitle) ||
      normalizedTitle.includes(eNorm)
    );
  });
  if (containsMatch) return { id: containsMatch.id };

  // Strategy 4: Word overlap (>70% of words match)
  const scrapedWords = new Set(normalizedTitle.split(/\s+/).filter((w) => w.length > 2));
  if (scrapedWords.size >= 3) {
    let bestOverlap = 0;
    let bestEpisode: { id: string } | null = null;

    for (const ep of episodes) {
      const epWords = new Set(normalizeTitle(ep.title).split(/\s+/).filter((w) => w.length > 2));
      const intersection = Array.from(scrapedWords).filter((w) => epWords.has(w));
      const overlap = intersection.length / Math.min(scrapedWords.size, epWords.size);

      if (overlap > bestOverlap && overlap > 0.7) {
        bestOverlap = overlap;
        bestEpisode = { id: ep.id };
      }
    }

    if (bestEpisode) return bestEpisode;
  }

  return null;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

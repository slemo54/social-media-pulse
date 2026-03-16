import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConnector } from "@/lib/connectors/types";
import { PLATFORMS } from "@/lib/constants";
import { fetchAndParseRSS } from "@/lib/rss-import";
import type { NormalizedDailyAggregate, NormalizedEpisodeMetric } from "@/lib/connectors/types";

interface SyncResult {
  platform: string;
  success: boolean;
  records: number;
  error?: string;
}

function timeoutPromise<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

const CONNECTOR_TIMEOUT_MS = 25_000;

export async function POST(request: Request) {
  try {
    // Auth check: CRON_SECRET or Supabase session
    const authHeader = request.headers.get("authorization");
    let authorized = false;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (token === process.env.CRON_SECRET) {
        authorized = true;
      }
    }

    if (!authorized) {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
    }

    const body = (await request.json().catch(() => ({}))) as {
      platform?: string;
      fullSync?: boolean;
    };
    const { platform, fullSync = false } = body;

    const supabaseAdmin = createAdminClient();
    const platformsToSync = platform
      ? [platform]
      : [...PLATFORMS];

    const endDate = new Date().toISOString().split("T")[0];
    const startDate = fullSync
      ? "2020-01-01"
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

    const results: SyncResult[] = [];

    for (const p of platformsToSync) {
      const startedAt = new Date().toISOString();
      let recordCount = 0;

      try {
        // Mark as syncing
        await supabaseAdmin
          .from("data_sources")
          .update({
            last_sync_status: "syncing",
            updated_at: new Date().toISOString(),
          } as never)
          .eq("platform", p);

        const connector = getConnector(p);

        // Fetch daily aggregates
        const aggregates: NormalizedDailyAggregate[] =
          await timeoutPromise(
            connector.fetchDailyAggregates(startDate, endDate),
            CONNECTOR_TIMEOUT_MS,
            `${p} fetchDailyAggregates`
          );

        // Batch upsert in chunks of 50
        for (let i = 0; i < aggregates.length; i += 50) {
          const chunk = aggregates.slice(i, i + 50);
          const rows = chunk.map((agg) => ({
            platform: agg.platform,
            date: agg.date,
            downloads: agg.downloads ?? null,
            views: agg.views ?? null,
            sessions: agg.sessions ?? null,
            listeners: agg.listeners ?? null,
            watch_time_minutes: agg.watch_time_minutes ?? null,
            likes: agg.likes ?? null,
            comments: agg.comments ?? null,
            shares: agg.shares ?? null,
            subscribers_gained: agg.subscribers_gained ?? null,
            page_views: agg.page_views ?? null,
            avg_session_duration: agg.avg_session_duration ?? null,
            bounce_rate: agg.bounce_rate ?? null,
            updated_at: new Date().toISOString(),
          }));

          const { error: upsertError } = await supabaseAdmin
            .from("daily_aggregates")
            .upsert(rows as never[], { onConflict: "platform,date" });

          if (upsertError) throw upsertError;
        }

        recordCount += aggregates.length;

        // Fetch episode metrics if available
        if (connector.fetchEpisodeMetrics) {
          const metrics: NormalizedEpisodeMetric[] =
            await timeoutPromise(
              connector.fetchEpisodeMetrics(startDate, endDate),
              CONNECTOR_TIMEOUT_MS,
              `${p} fetchEpisodeMetrics`
            );

          for (let i = 0; i < metrics.length; i += 50) {
            const chunk = metrics.slice(i, i + 50);
            const rows = chunk.map((m) => ({
              episode_id: m.external_id,
              platform: m.platform,
              external_id: m.external_id,
              date: m.date,
              downloads: m.downloads ?? null,
              views: m.views ?? null,
              likes: m.likes ?? null,
              comments: m.comments ?? null,
              watch_time_minutes: m.watch_time_minutes ?? null,
            }));

            const { error: metricError } = await supabaseAdmin
              .from("episode_metrics")
              .upsert(rows as never[], { onConflict: "episode_id,platform,date" });

            if (metricError) throw metricError;
          }

          recordCount += metrics.length;
        }

        // Log success
        await supabaseAdmin.from("sync_logs").insert({
          platform: p,
          sync_type: fullSync ? "full" : "incremental",
          status: "success",
          records_count: recordCount,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        } as never);

        // Update data source
        await supabaseAdmin
          .from("data_sources")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "success",
            last_sync_error: null,
            records_synced: recordCount,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("platform", p);

        results.push({ platform: p, success: true, records: recordCount });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";

        // Log failure
        await supabaseAdmin.from("sync_logs").insert({
          platform: p,
          sync_type: fullSync ? "full" : "incremental",
          status: "error",
          records_count: recordCount,
          error_message: errorMessage,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        } as never);

        // Update data source with error
        await supabaseAdmin
          .from("data_sources")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "error",
            last_sync_error: errorMessage,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("platform", p);

        results.push({
          platform: p,
          success: false,
          records: recordCount,
          error: errorMessage,
        });
      }
    }

    // Auto-import episodes from RSS feed
    const rssFeedUrl = process.env.RSS_FEED_URL;
    let rssImported = 0;
    if (rssFeedUrl) {
      try {
        const parsed = await fetchAndParseRSS(rssFeedUrl);

        for (let i = 0; i < parsed.length; i += 50) {
          const chunk = parsed.slice(i, i + 50);
          const rows = chunk.map((ep) => ({
            title: ep.title,
            description: ep.description || null,
            audio_url: ep.audioUrl || null,
            duration_seconds: ep.durationSeconds || null,
            publish_date: ep.publishDate || null,
            series: ep.series,
            tags: ep.tags.length > 0 ? ep.tags : null,
          }));

          const { error: rssError } = await supabaseAdmin
            .from("episodes")
            .upsert(rows as never[], { onConflict: "title" });

          if (rssError) {
            console.error("RSS episode upsert error:", rssError.message);
            break;
          }
          rssImported += chunk.length;
        }

        console.log(`RSS auto-import: ${rssImported} episodes processed`);
      } catch (rssErr) {
        console.error("RSS auto-import failed:", rssErr);
      }
    }

    return NextResponse.json({ results, rssImported });
  } catch {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

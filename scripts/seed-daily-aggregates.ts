import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Load environment variables from .env.local
config({ path: ".env.local" });

/**
 * Seed script: Popola daily_aggregates con dati aggregati giornalieri
 * - 4 piattaforme × 30 giorni = 120 record
 * - Dati coerenti con episode_metrics (somma dei singoli episodi)
 */

type DailyAggregatesInsert = Database["public"]["Tables"]["daily_aggregates"]["Insert"];

async function seedDailyAggregates() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Variabili di ambiente mancanti");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log("🌱 Inizio seed daily_aggregates...");

  // Recupera tutti gli episode_metrics che abbiamo appena creato
  const { data: episodeMetrics, error: metricsError } = await supabase
    .from("episode_metrics")
    .select("*");

  if (metricsError || !episodeMetrics) {
    console.error("❌ Errore nel recuperare episode_metrics:", metricsError);
    return;
  }

  console.log(`✓ Trovati ${episodeMetrics.length} episode_metrics`);

  // Aggrega i dati per piattaforma e data
  const aggregatesByPlatformDate = new Map<
    string,
    {
      total_downloads: number;
      unique_listeners: number;
      total_views: number;
      total_watch_time: number;
      pageviews: number;
      sessions: number;
      users: number;
      bounce_rate: number;
      avg_completion_rate: number;
    }
  >();

  for (const metric of episodeMetrics) {
    const key = `${metric.platform}|${metric.date}`;

    if (!aggregatesByPlatformDate.has(key)) {
      aggregatesByPlatformDate.set(key, {
        total_downloads: 0,
        unique_listeners: 0,
        total_views: 0,
        total_watch_time: 0,
        pageviews: 0,
        sessions: 0,
        users: 0,
        bounce_rate: 0,
        avg_completion_rate: 0,
      });
    }

    const agg = aggregatesByPlatformDate.get(key)!;

    if (metric.downloads) agg.total_downloads += metric.downloads;
    if (metric.views) {
      agg.total_views += metric.views;
      // Stima unique_listeners come 40% delle views (engagement)
      agg.unique_listeners += Math.floor(metric.views * 0.4);
    }
    if (metric.watch_time_minutes) agg.total_watch_time += metric.watch_time_minutes;

    // Per GA4, interpreta "views" come sessioni
    if (metric.platform === "ga4" && metric.views) {
      agg.sessions += metric.views;
      agg.users += Math.floor(metric.views * 0.8); // 80% engagement rate
      agg.pageviews += Math.floor(metric.views * 1.5); // 1.5 pages per session
      agg.bounce_rate = 35 + Math.random() * 20; // Stima bounce rate
    }
  }

  // Converti in array di insert
  const aggregates: DailyAggregatesInsert[] = Array.from(
    aggregatesByPlatformDate.entries()
  ).map(([key, agg]) => {
    const [platform, date] = key.split("|");

    // Stima avg_completion_rate basata su watch_time (per piattaforme podcast)
    const estimatedDuration = 45 * 60; // Stima 45 minuti per episodio
    const completionRate =
      platform === "megaphone"
        ? Math.min(100, (agg.total_watch_time / (agg.total_downloads || 1)) / estimatedDuration * 100 || 0)
        : 0;

    return {
      platform,
      date,
      total_downloads: agg.total_downloads > 0 ? Math.floor(agg.total_downloads) : null,
      unique_listeners: agg.unique_listeners > 0 ? Math.floor(agg.unique_listeners) : null,
      total_views: agg.total_views > 0 ? Math.floor(agg.total_views) : null,
      total_watch_time: agg.total_watch_time > 0 ? Math.floor(agg.total_watch_time) : null,
      pageviews: agg.pageviews > 0 ? Math.floor(agg.pageviews) : null,
      sessions: agg.sessions > 0 ? Math.floor(agg.sessions) : null,
      users: agg.users > 0 ? Math.floor(agg.users) : null,
      bounce_rate: agg.bounce_rate > 0 ? parseFloat(agg.bounce_rate.toFixed(2)) : null,
      avg_completion_rate: completionRate > 0 ? parseFloat(completionRate.toFixed(2)) : null,
    };
  });

  console.log(`📊 Aggregati generati: ${aggregates.length} record`);

  // Batch insert
  const chunkSize = 100;
  let inserted = 0;

  for (let i = 0; i < aggregates.length; i += chunkSize) {
    const chunk = aggregates.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("daily_aggregates")
      .upsert(chunk, { onConflict: "platform,date" });

    if (error) {
      console.error(`❌ Errore inserimento chunk ${i / chunkSize}:`, error);
      return;
    }

    inserted += chunk.length;
    console.log(`✓ Inseriti ${inserted}/${aggregates.length} record`);
  }

  console.log(`✅ Seed daily_aggregates completato: ${aggregates.length} record inseriti`);
}

seedDailyAggregates().catch(console.error);

// @ts-nocheck
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Load environment variables from .env.local
config({ path: ".env.local" });

/**
 * Seed script: Popola episode_metrics con dati demo realistici
 * - 50 episodi × 30 giorni × 4 piattaforme = 6000 record
 * - Metriche realistiche con trend (crescita lun-ven, calo fine settimana)
 */

type EpisodeMetricsInsert = Database["public"]["Tables"]["episode_metrics"]["Insert"];

async function seedEpisodeMetrics() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Variabili di ambiente mancanti");
    console.error("NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
    console.error("SUPABASE_SERVICE_ROLE_KEY:", supabaseKey ? "✓" : "✗");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log("🌱 Inizio seed episode_metrics...");

  // Recupera i primi 50 episodi
  const { data: episodes, error: episodesError } = await supabase
    .from("episodes")
    .select("id")
    .limit(50);

  if (episodesError || !episodes || episodes.length === 0) {
    console.error("❌ Errore nel recuperare episodi:", episodesError);
    return;
  }

  console.log(`✓ Trovati ${episodes.length} episodi`);

  // Date range: Feb 14 - Mar 16, 2026 (30 giorni)
  const startDate = new Date(2026, 1, 14); // Feb 14
  const endDate = new Date(2026, 2, 16);   // Mar 16
  const daysCount = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const platforms = ["megaphone", "youtube", "soundcloud", "ga4"];
  const metrics: EpisodeMetricsInsert[] = [];

  // Per ogni episodio, genera dati per 30 giorni × 4 piattaforme
  for (const episode of episodes) {
    for (let dayOffset = 0; dayOffset <= daysCount; dayOffset++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + dayOffset);
      const dateStr = currentDate.toISOString().split("T")[0];

      // Trend realistico: crescita lun-ven, calo weekend
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const trendMultiplier = isWeekend ? 0.6 : 1.0 + Math.random() * 0.4;

      for (const platform of platforms) {
        let downloads: number | null = null,
          views: number | null = null,
          watchTimeMinutes: number | null = null;

        if (platform === "megaphone") {
          downloads = Math.floor(100 + Math.random() * 5000 * trendMultiplier);
        } else if (platform === "youtube") {
          views = Math.floor(50 + Math.random() * 1000 * trendMultiplier);
          watchTimeMinutes = views * (30 + Math.random() * 60);
        } else if (platform === "soundcloud") {
          downloads = Math.floor(20 + Math.random() * 500 * trendMultiplier);
        } else if (platform === "ga4") {
          // GA4 non ha downloads, usa views per sessioni
          views = Math.floor(50 + Math.random() * 500 * trendMultiplier);
        }

        metrics.push({
          episode_id: episode.id,
          platform,
          date: dateStr,
          downloads,
          views,
          watch_time_minutes: watchTimeMinutes,
        });
      }
    }
  }

  // Batch insert in chunks di 500
  const chunkSize = 500;
  let inserted = 0;

  for (let i = 0; i < metrics.length; i += chunkSize) {
    const chunk = metrics.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("episode_metrics")
      .upsert(chunk, { onConflict: "episode_id,platform,date" });

    if (error) {
      console.error(`❌ Errore inserimento chunk ${i / chunkSize}:`, error);
      return;
    }

    inserted += chunk.length;
    console.log(`✓ Inseriti ${inserted}/${metrics.length} record`);
  }

  console.log(`✅ Seed episode_metrics completato: ${metrics.length} record inseriti`);
}

seedEpisodeMetrics().catch(console.error);

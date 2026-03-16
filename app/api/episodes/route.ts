import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAndParseRSS } from "@/lib/rss-import";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const searchParams = request.nextUrl.searchParams;

    const search = searchParams.get("search") || "";
    const series = searchParams.get("series") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from("episodes")
      .select("*", { count: "exact" });

    if (search) {
      query = query.ilike("title", `%${search}%`);
    }

    if (series) {
      query = query.eq("series", series);
    }

    query = query
      .order("publish_date", { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data: episodes, error, count } = await query;

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    // Fetch aggregate metrics for these episodes
    const episodeList = (episodes || []) as Array<Record<string, unknown>>;
    const episodeIds = episodeList.map((e) => e.id as string);
    let episodesWithMetrics: Record<string, unknown>[] = episodeList;

    if (episodeIds.length > 0) {
      const { data: metrics } = await supabase
        .from("episode_metrics")
        .select("episode_id, downloads, views")
        .in("episode_id", episodeIds);

      const metricRows = (metrics || []) as Array<{
        episode_id: string;
        downloads: number | null;
        views: number | null;
      }>;

      if (metricRows.length > 0) {
        const metricMap = new Map<
          string,
          { downloads: number; views: number }
        >();
        for (const m of metricRows) {
          const existing = metricMap.get(m.episode_id) || {
            downloads: 0,
            views: 0,
          };
          metricMap.set(m.episode_id, {
            downloads: existing.downloads + (m.downloads || 0),
            views: existing.views + (m.views || 0),
          });
        }

        episodesWithMetrics = episodeList.map((ep) => {
          const m = metricMap.get(ep.id as string);
          return {
            ...ep,
            downloads: m?.downloads ?? null,
            views: m?.views ?? null,
          };
        });
      }
    }

    return NextResponse.json({
      episodes: episodesWithMetrics,
      total: count || 0,
      page,
      pageSize,
    });
  } catch {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { feedUrl } = (await request.json()) as { feedUrl?: string };

    if (!feedUrl) {
      return NextResponse.json(
        { message: "feedUrl is required" },
        { status: 400 }
      );
    }

    const parsed = await fetchAndParseRSS(feedUrl);
    const supabaseAdmin = createAdminClient();

    let imported = 0;
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

      const { error } = await supabaseAdmin
        .from("episodes")
        .upsert(rows as never[], { onConflict: "title" });

      if (error) throw error;
      imported += chunk.length;
    }

    return NextResponse.json({ imported });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}

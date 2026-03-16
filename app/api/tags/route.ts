import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const sp = request.nextUrl.searchParams;
    const startDate = sp.get("startDate");
    const endDate = sp.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json({ message: "startDate and endDate required" }, { status: 400 });
    }

    // Fetch all episodes with tags
    const { data: episodes, error: epError } = await supabase
      .from("episodes")
      .select("id,tags,series");

    if (epError) return NextResponse.json({ message: epError.message }, { status: 500 });

    // Fetch episode_metrics for the period
    const { data: metrics, error: mError } = await supabase
      .from("episode_metrics")
      .select("episode_id,downloads,views")
      .gte("date", startDate)
      .lte("date", endDate);

    if (mError) return NextResponse.json({ message: mError.message }, { status: 500 });

    // Previous period
    const start = new Date(startDate);
    const end = new Date(endDate);
    const periodMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodMs).toISOString().split("T")[0];
    const prevEnd = new Date(start.getTime() - 86400000).toISOString().split("T")[0];

    const { data: prevMetrics } = await supabase
      .from("episode_metrics")
      .select("episode_id,downloads,views")
      .gte("date", prevStart)
      .lte("date", prevEnd);

    // Aggregate metrics per episode
    const episodeTotals = new Map<string, { downloads: number; views: number }>();
    for (const m of metrics || []) {
      const e = episodeTotals.get(m.episode_id) || { downloads: 0, views: 0 };
      e.downloads += m.downloads || 0;
      e.views += m.views || 0;
      episodeTotals.set(m.episode_id, e);
    }

    const prevEpisodeTotals = new Map<string, { downloads: number; views: number }>();
    for (const m of prevMetrics || []) {
      const e = prevEpisodeTotals.get(m.episode_id) || { downloads: 0, views: 0 };
      e.downloads += m.downloads || 0;
      e.views += m.views || 0;
      prevEpisodeTotals.set(m.episode_id, e);
    }

    // Aggregate by tag
    const tagMap = new Map<string, { episodeIds: Set<string>; downloads: number; views: number; prevDownloads: number }>();

    for (const ep of episodes || []) {
      const tags: string[] = ep.tags || [];
      if (tags.length === 0) continue;

      const epMetric = episodeTotals.get(ep.id) || { downloads: 0, views: 0 };
      const prevMetric = prevEpisodeTotals.get(ep.id) || { downloads: 0, views: 0 };

      for (const tag of tags) {
        const existing = tagMap.get(tag) || { episodeIds: new Set(), downloads: 0, views: 0, prevDownloads: 0 };
        existing.episodeIds.add(ep.id);
        existing.downloads += epMetric.downloads;
        existing.views += epMetric.views;
        existing.prevDownloads += prevMetric.downloads;
        tagMap.set(tag, existing);
      }
    }

    // Build tag analytics
    const tagAnalytics = Array.from(tagMap.entries()).map(([tag, data]) => {
      const count = data.episodeIds.size;
      const avgDownloads = count > 0 ? Math.round(data.downloads / count) : 0;
      const avgViews = count > 0 ? Math.round(data.views / count) : 0;
      const prevAvgDownloads = count > 0 ? data.prevDownloads / count : 0;
      const trend = prevAvgDownloads > 0
        ? Math.round(((avgDownloads - prevAvgDownloads) / prevAvgDownloads) * 1000) / 10
        : 0;

      // Extract category from tag prefix (e.g. "region:toscana" → "region")
      const colonIdx = tag.indexOf(":");
      const category = colonIdx > 0 ? tag.substring(0, colonIdx) : null;
      const label = colonIdx > 0 ? tag.substring(colonIdx + 1) : tag;

      return { tag, label, category, episodeCount: count, avgDownloads, avgViews, trend };
    }).sort((a, b) => b.avgDownloads - a.avgDownloads);

    // Get top 20
    const top20 = tagAnalytics.slice(0, 20);

    // Get unique categories
    const categories = Array.from(new Set(
      tagAnalytics.map((t) => t.category).filter(Boolean)
    )) as string[];

    return NextResponse.json({ tags: top20, allTags: tagAnalytics, categories });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

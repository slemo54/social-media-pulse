import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface DailyRow {
  platform: string;
  date: string;
  total_downloads: number | null;
  unique_listeners: number | null;
  total_views: number | null;
  sessions: number | null;
}

function computeMovingAverage(data: { date: string; value: number }[], window: number) {
  return data.map((item, idx) => {
    const start = Math.max(0, idx - window + 1);
    const slice = data.slice(start, idx + 1);
    const avg = slice.reduce((s, d) => s + d.value, 0) / slice.length;
    return { date: item.date, value: item.value, ma7: Math.round(avg) };
  });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const sp = request.nextUrl.searchParams;
    const startDate = sp.get("startDate");
    const endDate = sp.get("endDate");
    const metric = sp.get("metric") || "downloads";

    if (!startDate || !endDate) {
      return NextResponse.json({ message: "startDate and endDate required" }, { status: 400 });
    }

    // Previous period
    const start = new Date(startDate);
    const end = new Date(endDate);
    const periodMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodMs).toISOString().split("T")[0];
    const prevEnd = new Date(start.getTime() - 86400000).toISOString().split("T")[0];

    // Fetch current period aggregates
    const { data: rows, error } = await supabase
      .from("daily_aggregates")
      .select("platform,date,total_downloads,unique_listeners,total_views,sessions")
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });

    // Fetch previous period aggregates
    const { data: prevRows } = await supabase
      .from("daily_aggregates")
      .select("platform,date,total_downloads,unique_listeners,total_views,sessions")
      .gte("date", prevStart)
      .lte("date", prevEnd);

    const current = rows as DailyRow[] || [];
    const previous = prevRows as DailyRow[] || [];

    // Compute KPI totals
    const totals = {
      downloads: 0, views: 0, sessions: 0, listeners: 0, reach: 0,
    };
    const prevTotals = {
      downloads: 0, views: 0, sessions: 0, listeners: 0, reach: 0,
    };

    for (const r of current) {
      totals.downloads += r.total_downloads || 0;
      totals.views += r.total_views || 0;
      totals.sessions += r.sessions || 0;
      totals.listeners += r.unique_listeners || 0;
    }
    totals.reach = totals.downloads + totals.views + totals.listeners;

    for (const r of previous) {
      prevTotals.downloads += r.total_downloads || 0;
      prevTotals.views += r.total_views || 0;
      prevTotals.sessions += r.sessions || 0;
      prevTotals.listeners += r.unique_listeners || 0;
    }
    prevTotals.reach = prevTotals.downloads + prevTotals.views + prevTotals.listeners;

    // Daily totals for trend chart (sum all platforms per day)
    const dailyMap = new Map<string, { downloads: number; views: number; sessions: number; listeners: number }>();
    for (const r of current) {
      const existing = dailyMap.get(r.date) || { downloads: 0, views: 0, sessions: 0, listeners: 0 };
      existing.downloads += r.total_downloads || 0;
      existing.views += r.total_views || 0;
      existing.sessions += r.sessions || 0;
      existing.listeners += r.unique_listeners || 0;
      dailyMap.set(r.date, existing);
    }

    const dailyValues = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => {
        let value: number;
        switch (metric) {
          case "views": value = vals.views; break;
          case "sessions": value = vals.sessions; break;
          case "reach": value = vals.downloads + vals.views + vals.listeners; break;
          default: value = vals.downloads;
        }
        return { date, value };
      });

    const trendData = computeMovingAverage(dailyValues, 7);

    // Sparkline: last 30 days per KPI (all platforms summed)
    const sparkMap = new Map<string, { downloads: number; views: number; sessions: number; listeners: number }>();
    for (const r of current) {
      const existing = sparkMap.get(r.date) || { downloads: 0, views: 0, sessions: 0, listeners: 0 };
      existing.downloads += r.total_downloads || 0;
      existing.views += r.total_views || 0;
      existing.sessions += r.sessions || 0;
      existing.listeners += r.unique_listeners || 0;
      sparkMap.set(r.date, existing);
    }
    const sparklineData = Array.from(sparkMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        downloads: vals.downloads,
        views: vals.views,
        sessions: vals.sessions,
        listeners: vals.listeners,
        reach: vals.downloads + vals.views + vals.listeners,
      }));

    // Top 5 episodes
    const { data: episodeMetrics } = await supabase
      .from("episode_metrics")
      .select("episode_id,downloads,views")
      .gte("date", startDate)
      .lte("date", endDate);

    const episodeTotals = new Map<string, { downloads: number; views: number }>();
    for (const m of episodeMetrics || []) {
      const existing = episodeTotals.get(m.episode_id) || { downloads: 0, views: 0 };
      existing.downloads += m.downloads || 0;
      existing.views += m.views || 0;
      episodeTotals.set(m.episode_id, existing);
    }

    const sortedEpisodeIds = Array.from(episodeTotals.entries())
      .sort(([, a], [, b]) => (b.downloads + b.views) - (a.downloads + a.views))
      .slice(0, 5)
      .map(([id]) => id);

    let topEpisodes: { id: string; title: string; series: string | null; pub_date: string | null; downloads: number; views: number; reach: number }[] = [];
    if (sortedEpisodeIds.length > 0) {
      const { data: epData } = await supabase
        .from("episodes")
        .select("id,title,series,pub_date")
        .in("id", sortedEpisodeIds);

      topEpisodes = (epData || []).map((ep) => {
        const m = episodeTotals.get(ep.id) || { downloads: 0, views: 0 };
        return {
          id: ep.id,
          title: ep.title,
          series: ep.series,
          pub_date: ep.pub_date,
          downloads: m.downloads,
          views: m.views,
          reach: m.downloads + m.views,
        };
      }).sort((a, b) => b.reach - a.reach);
    }

    // Series performance
    const { data: allEpisodes } = await supabase
      .from("episodes")
      .select("id,series");

    const seriesEpisodeMap = new Map<string, string[]>();
    for (const ep of allEpisodes || []) {
      const s = ep.series || "Uncategorized";
      const existing = seriesEpisodeMap.get(s) || [];
      existing.push(ep.id);
      seriesEpisodeMap.set(s, existing);
    }

    // Fetch all episode_metrics for the period
    const { data: allMetrics } = await supabase
      .from("episode_metrics")
      .select("episode_id,downloads,views")
      .gte("date", startDate)
      .lte("date", endDate);

    // Fetch previous period metrics for series trend
    const { data: prevMetrics } = await supabase
      .from("episode_metrics")
      .select("episode_id,downloads,views")
      .gte("date", prevStart)
      .lte("date", prevEnd);

    const episodeTotalsAll = new Map<string, { downloads: number; views: number }>();
    for (const m of allMetrics || []) {
      const existing = episodeTotalsAll.get(m.episode_id) || { downloads: 0, views: 0 };
      existing.downloads += m.downloads || 0;
      existing.views += m.views || 0;
      episodeTotalsAll.set(m.episode_id, existing);
    }

    const prevEpisodeTotals = new Map<string, { downloads: number; views: number }>();
    for (const m of prevMetrics || []) {
      const existing = prevEpisodeTotals.get(m.episode_id) || { downloads: 0, views: 0 };
      existing.downloads += m.downloads || 0;
      existing.views += m.views || 0;
      prevEpisodeTotals.set(m.episode_id, existing);
    }

    const seriesPerformance = Array.from(seriesEpisodeMap.entries()).map(([series, episodeIds]) => {
      const totalDownloads = episodeIds.reduce((s, id) => s + (episodeTotalsAll.get(id)?.downloads || 0), 0);
      const avgDownloads = episodeIds.length > 0 ? Math.round(totalDownloads / episodeIds.length) : 0;
      const prevTotal = episodeIds.reduce((s, id) => s + (prevEpisodeTotals.get(id)?.downloads || 0), 0);
      const prevAvg = episodeIds.length > 0 ? prevTotal / episodeIds.length : 0;
      const trend = prevAvg > 0 ? ((avgDownloads - prevAvg) / prevAvg) * 100 : 0;
      return { series, episodeCount: episodeIds.length, avgDownloads, trend: Math.round(trend * 10) / 10 };
    }).sort((a, b) => b.avgDownloads - a.avgDownloads);

    // Heatmap: group daily_aggregates by day of week
    const dowMap = new Map<number, { downloads: number[]; views: number[]; sessions: number[] }>();
    for (let i = 0; i < 7; i++) {
      dowMap.set(i, { downloads: [], views: [], sessions: [] });
    }
    for (const [date, vals] of Array.from(dailyMap.entries())) {
      const dow = new Date(date + "T12:00:00Z").getDay(); // 0=Sun, 6=Sat
      const entry = dowMap.get(dow)!;
      entry.downloads.push(vals.downloads);
      entry.views.push(vals.views);
      entry.sessions.push(vals.sessions);
    }

    // Reorder: Mon(1)...Sun(0)
    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const heatmap = dayOrder.map((dow, idx) => {
      const entry = dowMap.get(dow)!;
      const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
      return {
        day: dayNames[idx],
        downloads: avg(entry.downloads),
        views: avg(entry.views),
        sessions: avg(entry.sessions),
      };
    });

    return NextResponse.json({
      totals,
      prevTotals,
      trendData,
      sparklineData,
      topEpisodes,
      seriesPerformance,
      heatmap,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

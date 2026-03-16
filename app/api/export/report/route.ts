import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ExecTotals {
  downloads: number;
  views: number;
  sessions: number;
  listeners: number;
  reach: number;
}

interface TopEpisode {
  title: string;
  series: string | null;
  pub_date: string | null;
  downloads: number;
  views: number;
  reach: number;
}

interface SeriesRow {
  series: string;
  episodeCount: number;
  avgDownloads: number;
  trend: number;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

// Generate CSV response for daily_aggregates
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const sp = request.nextUrl.searchParams;
    const startDate = sp.get("startDate");
    const endDate = sp.get("endDate");
    const format = sp.get("format") || "pdf";

    if (!startDate || !endDate) {
      return NextResponse.json({ message: "startDate and endDate required" }, { status: 400 });
    }

    if (format === "csv") {
      const { data: rows, error } = await supabase
        .from("daily_aggregates")
        .select("platform,date,total_downloads,unique_listeners,total_views,total_watch_time,pageviews,sessions,users,bounce_rate,avg_completion_rate")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true })
        .order("platform", { ascending: true });

      if (error) return NextResponse.json({ message: error.message }, { status: 500 });

      const headers = ["platform", "date", "total_downloads", "unique_listeners", "total_views", "total_watch_time", "pageviews", "sessions", "users", "bounce_rate", "avg_completion_rate"];
      const csvRows = [headers.join(",")];

      for (const r of rows || []) {
        csvRows.push([
          r.platform,
          r.date,
          r.total_downloads ?? "",
          r.unique_listeners ?? "",
          r.total_views ?? "",
          r.total_watch_time ?? "",
          r.pageviews ?? "",
          r.sessions ?? "",
          r.users ?? "",
          r.bounce_rate ?? "",
          r.avg_completion_rate ?? "",
        ].join(","));
      }

      const csv = csvRows.join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="analytics-${startDate}-${endDate}.csv"`,
        },
      });
    }

    // PDF: gather data server-side
    const execRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/executive?startDate=${startDate}&endDate=${endDate}`,
      { headers: { cookie: request.headers.get("cookie") || "" } }
    );

    let totals: ExecTotals = { downloads: 0, views: 0, sessions: 0, listeners: 0, reach: 0 };
    let topEpisodes: TopEpisode[] = [];
    let seriesPerformance: SeriesRow[] = [];

    if (execRes.ok) {
      const execData = await execRes.json();
      totals = execData.totals || totals;
      topEpisodes = execData.topEpisodes || [];
      seriesPerformance = execData.seriesPerformance || [];
    }

    // Build PDF as HTML content encoded in base64 for client-side rendering
    // Return structured data that the client can use with jsPDF
    const reportData = {
      title: `Italian Wine Podcast — Report ${startDate} - ${endDate}`,
      generatedAt: new Date().toISOString(),
      period: { startDate, endDate },
      kpis: [
        { label: "Total Reach", value: formatNum(totals.reach) },
        { label: "Downloads (Megaphone)", value: formatNum(totals.downloads) },
        { label: "Views (YouTube)", value: formatNum(totals.views) },
        { label: "Sessions (GA4)", value: formatNum(totals.sessions) },
        { label: "Listeners (SoundCloud)", value: formatNum(totals.listeners) },
      ],
      topEpisodes: topEpisodes.map((ep, i) => ({
        rank: i + 1,
        title: ep.title,
        series: ep.series || "-",
        pubDate: ep.pub_date || "-",
        downloads: formatNum(ep.downloads),
        views: formatNum(ep.views),
        reach: formatNum(ep.reach),
      })),
      seriesPerformance: seriesPerformance.map((s) => ({
        series: s.series,
        episodes: s.episodeCount,
        avgDownloads: formatNum(s.avgDownloads),
        trend: `${s.trend >= 0 ? "+" : ""}${s.trend}%`,
      })),
    };

    return NextResponse.json(reportData);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

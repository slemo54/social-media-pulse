import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const searchParams = request.nextUrl.searchParams;

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const platform = searchParams.get("platform");
    const granularity = searchParams.get("granularity") || "daily";

    if (!startDate || !endDate) {
      return NextResponse.json(
        { message: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    // Calculate previous period for comparison
    const start = new Date(startDate);
    const end = new Date(endDate);
    const periodMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodMs)
      .toISOString()
      .split("T")[0];
    const prevEnd = new Date(start.getTime() - 1)
      .toISOString()
      .split("T")[0];

    if (granularity === "daily") {
      // Simple query for daily data
      let query = supabase
        .from("daily_aggregates")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (platform) {
        query = query.eq("platform", platform);
      }

      const { data: aggregates, error } = await query;
      if (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
      }

      // Fetch previous period for comparison
      let prevQuery = supabase
        .from("daily_aggregates")
        .select("*")
        .gte("date", prevStart)
        .lte("date", prevEnd);

      if (platform) {
        prevQuery = prevQuery.eq("platform", platform);
      }

      const { data: prevAggregates } = await prevQuery;

      const totals = computeTotals(aggregates || []);
      const previousTotals = computeTotals(prevAggregates || []);

      return NextResponse.json({
        aggregates: aggregates || [],
        totals,
        previousTotals,
      });
    }

    // For weekly/monthly, use SQL with DATE_TRUNC
    const truncUnit = granularity === "weekly" ? "week" : "month";
    const platformFilter = platform
      ? `AND platform = '${platform}'`
      : "";

    const { data: aggregated, error: sqlError } = await supabase.rpc(
      "aggregate_by_period" as never,
      {
        p_start_date: startDate,
        p_end_date: endDate,
        p_trunc_unit: truncUnit,
        p_platform: platform || "",
      } as never
    );

    if (sqlError) {
      // Fallback: query daily and aggregate in code
      let query = supabase
        .from("daily_aggregates")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (platform) {
        query = query.eq("platform", platform);
      }

      const { data: dailyData, error } = await query;
      if (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
      }

      // Aggregate by period in code
      const grouped = groupByPeriod(dailyData || [], granularity);

      let prevQuery = supabase
        .from("daily_aggregates")
        .select("*")
        .gte("date", prevStart)
        .lte("date", prevEnd);

      if (platform) {
        prevQuery = prevQuery.eq("platform", platform);
      }

      const { data: prevData } = await prevQuery;
      const totals = computeTotals(dailyData || []);
      const previousTotals = computeTotals(prevData || []);

      // Suppress unused variable warning
      void platformFilter;
      void aggregated;

      return NextResponse.json({
        aggregates: grouped,
        totals,
        previousTotals,
      });
    }

    // Fetch previous period
    let prevQuery = supabase
      .from("daily_aggregates")
      .select("*")
      .gte("date", prevStart)
      .lte("date", prevEnd);

    if (platform) {
      prevQuery = prevQuery.eq("platform", platform);
    }

    const { data: prevData } = await prevQuery;
    const totals = computeTotals((aggregated as AggregateRow[]) || []);
    const previousTotals = computeTotals(prevData || []);

    return NextResponse.json({
      aggregates: aggregated || [],
      totals,
      previousTotals,
    });
  } catch {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

interface AggregateRow {
  platform: string;
  date: string;
  downloads: number | null;
  views: number | null;
  sessions: number | null;
  listeners: number | null;
  watch_time_minutes: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  subscribers_gained: number | null;
  page_views: number | null;
  avg_session_duration: number | null;
  bounce_rate: number | null;
}

function computeTotals(rows: AggregateRow[]): Record<string, number> {
  const totals: Record<string, number> = {
    downloads: 0,
    views: 0,
    sessions: 0,
    listeners: 0,
    watch_time_minutes: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    subscribers_gained: 0,
    page_views: 0,
  };

  for (const row of rows) {
    totals.downloads += row.downloads || 0;
    totals.views += row.views || 0;
    totals.sessions += row.sessions || 0;
    totals.listeners += row.listeners || 0;
    totals.watch_time_minutes += row.watch_time_minutes || 0;
    totals.likes += row.likes || 0;
    totals.comments += row.comments || 0;
    totals.shares += row.shares || 0;
    totals.subscribers_gained += row.subscribers_gained || 0;
    totals.page_views += row.page_views || 0;
  }

  return totals;
}

function groupByPeriod(
  rows: AggregateRow[],
  granularity: string
): AggregateRow[] {
  const groups = new Map<string, AggregateRow[]>();

  for (const row of rows) {
    const d = new Date(row.date);
    let key: string;

    if (granularity === "weekly") {
      // Get ISO week start (Monday)
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      key = `${row.platform}|${monday.toISOString().split("T")[0]}`;
    } else {
      // Monthly
      key = `${row.platform}|${row.date.substring(0, 7)}-01`;
    }

    const existing = groups.get(key) || [];
    existing.push(row);
    groups.set(key, existing);
  }

  const result: AggregateRow[] = [];
  for (const [key, groupRows] of Array.from(groups.entries())) {
    const [platform, date] = key.split("|");
    const summed: AggregateRow = {
      platform,
      date,
      downloads: null,
      views: null,
      sessions: null,
      listeners: null,
      watch_time_minutes: null,
      likes: null,
      comments: null,
      shares: null,
      subscribers_gained: null,
      page_views: null,
      avg_session_duration: null,
      bounce_rate: null,
    };

    for (const r of groupRows) {
      if (r.downloads != null)
        summed.downloads = (summed.downloads || 0) + r.downloads;
      if (r.views != null) summed.views = (summed.views || 0) + r.views;
      if (r.sessions != null)
        summed.sessions = (summed.sessions || 0) + r.sessions;
      if (r.listeners != null)
        summed.listeners = (summed.listeners || 0) + r.listeners;
      if (r.watch_time_minutes != null)
        summed.watch_time_minutes =
          (summed.watch_time_minutes || 0) + r.watch_time_minutes;
      if (r.likes != null) summed.likes = (summed.likes || 0) + r.likes;
      if (r.comments != null)
        summed.comments = (summed.comments || 0) + r.comments;
      if (r.shares != null) summed.shares = (summed.shares || 0) + r.shares;
      if (r.subscribers_gained != null)
        summed.subscribers_gained =
          (summed.subscribers_gained || 0) + r.subscribers_gained;
      if (r.page_views != null)
        summed.page_views = (summed.page_views || 0) + r.page_views;
    }

    result.push(summed);
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

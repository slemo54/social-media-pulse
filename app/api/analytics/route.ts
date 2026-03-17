// @ts-nocheck
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
  total_downloads: number | null;
  unique_listeners: number | null;
  total_views: number | null;
  total_watch_time: number | null;
  pageviews: number | null;
  sessions: number | null;
  users: number | null;
  bounce_rate: number | null;
  avg_completion_rate: number | null;
  raw_data: unknown;
}

function computeTotals(rows: AggregateRow[]): Record<string, number> {
  const totals: Record<string, number> = {
    total_downloads: 0,
    total_views: 0,
    sessions: 0,
    unique_listeners: 0,
    total_watch_time: 0,
    pageviews: 0,
    users: 0,
  };

  for (const row of rows) {
    totals.total_downloads += row.total_downloads || 0;
    totals.total_views += row.total_views || 0;
    totals.sessions += row.sessions || 0;
    totals.unique_listeners += row.unique_listeners || 0;
    totals.total_watch_time += row.total_watch_time || 0;
    totals.pageviews += row.pageviews || 0;
    totals.users += row.users || 0;
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
      total_downloads: null,
      unique_listeners: null,
      total_views: null,
      total_watch_time: null,
      pageviews: null,
      sessions: null,
      users: null,
      bounce_rate: null,
      avg_completion_rate: null,
      raw_data: null,
    };

    for (const r of groupRows) {
      if (r.total_downloads != null)
        summed.total_downloads = (summed.total_downloads || 0) + r.total_downloads;
      if (r.total_views != null)
        summed.total_views = (summed.total_views || 0) + r.total_views;
      if (r.sessions != null)
        summed.sessions = (summed.sessions || 0) + r.sessions;
      if (r.unique_listeners != null)
        summed.unique_listeners = (summed.unique_listeners || 0) + r.unique_listeners;
      if (r.total_watch_time != null)
        summed.total_watch_time = (summed.total_watch_time || 0) + r.total_watch_time;
      if (r.pageviews != null)
        summed.pageviews = (summed.pageviews || 0) + r.pageviews;
      if (r.users != null)
        summed.users = (summed.users || 0) + r.users;
    }

    result.push(summed);
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

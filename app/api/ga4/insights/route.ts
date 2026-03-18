// @ts-nocheck
import { GA4Connector } from "@/lib/connectors/ga4";

export const runtime = "nodejs";

function calculateTotals(dailyAggregates: any[]) {
  const totals = dailyAggregates.reduce(
    (acc, day) => ({
      sessions: acc.sessions + day.sessions,
      users: acc.users + (day.users || 0),
      page_views: acc.page_views + day.page_views,
      avg_session_duration:
        acc.avg_session_duration + day.avg_session_duration,
      bounce_rate: acc.bounce_rate + day.bounce_rate,
    }),
    {
      sessions: 0,
      users: 0,
      page_views: 0,
      avg_session_duration: 0,
      bounce_rate: 0,
    }
  );

  const days = dailyAggregates.length || 1;
  totals.avg_session_duration = totals.avg_session_duration / days;
  totals.bounce_rate = totals.bounce_rate / days;

  return totals;
}

function calculatePreviousPeriod(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const periodMs = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - periodMs).toISOString().split("T")[0];
  const prevEnd = new Date(start.getTime() - 1).toISOString().split("T")[0];
  return { prevStart, prevEnd };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") || "30daysAgo";
    const endDate = searchParams.get("endDate") || "today";

    const ga4 = new GA4Connector();

    // Calculate previous period
    const { prevStart, prevEnd } = calculatePreviousPeriod(startDate, endDate);

    // Fetch all data in parallel
    const [
      dailyAggregates,
      trafficSources,
      topPages,
      geographic,
      deviceBreakdown,
      previousDailyAggregates,
    ] = await Promise.all([
      ga4.fetchDailyAggregates(startDate, endDate),
      ga4.fetchTrafficSources(startDate, endDate),
      ga4.fetchTopPages(startDate, endDate),
      ga4.fetchGeographic(startDate, endDate),
      ga4.fetchDeviceBreakdown(startDate, endDate),
      ga4.fetchDailyAggregates(prevStart, prevEnd),
    ]);

    const totals = calculateTotals(dailyAggregates);
    const previousSummary = calculateTotals(previousDailyAggregates);

    return Response.json({
      success: true,
      data: {
        summary: totals,
        previousSummary,
        dailyAggregates,
        trafficSources,
        topPages,
        geographic,
        deviceBreakdown,
      },
    });
  } catch (error) {
    console.error("GA4 insights API error:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

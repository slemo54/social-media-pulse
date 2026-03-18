import { NextResponse, type NextRequest } from "next/server";

interface YouTubeTokenResponse {
  access_token: string;
}

interface YouTubeAnalyticsRow {
  [index: number]: string | number;
}

async function getAccessToken(): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID || "",
      client_secret: process.env.YOUTUBE_CLIENT_SECRET || "",
      refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN || "",
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  const data: YouTubeTokenResponse = await response.json();
  return data.access_token;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const channelId = searchParams.get("channelId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!channelId || !startDate || !endDate) {
    return NextResponse.json(
      { message: "channelId, startDate and endDate are required" },
      { status: 400 }
    );
  }

  const hasOAuth =
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

  if (!hasOAuth) {
    return NextResponse.json(
      { message: "YouTube OAuth credentials not configured" },
      { status: 501 }
    );
  }

  try {
    const accessToken = await getAccessToken();

    const params = new URLSearchParams({
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      metrics: "views,estimatedMinutesWatched,likes,comments,shares,subscribersGained",
      dimensions: "day",
      sort: "day",
    });

    const res = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`YouTube Analytics API error for channel ${channelId}:`, res.status, errText);
      return NextResponse.json(
        { message: `YouTube Analytics error: ${res.status} ${errText}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rows: YouTubeAnalyticsRow[] = data.rows || [];

    const aggregates = rows.map((row) => ({
      date: String(row[0]),
      youtube: Number(row[1]) || 0,
      watch_time: Number(row[2]) || 0,
      likes: Number(row[3]) || 0,
      comments: Number(row[4]) || 0,
      shares: Number(row[5]) || 0,
      subscribers_gained: Number(row[6]) || 0,
    }));

    const totals = aggregates.reduce(
      (acc, row) => ({
        total_views: acc.total_views + row.youtube,
        total_watch_time: acc.total_watch_time + row.watch_time,
        likes: acc.likes + row.likes,
        comments: acc.comments + row.comments,
        shares: acc.shares + row.shares,
        subscribers_gained: acc.subscribers_gained + row.subscribers_gained,
      }),
      {
        total_views: 0,
        total_watch_time: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        subscribers_gained: 0,
      }
    );

    // Previous period for comparison
    const start = new Date(startDate);
    const end = new Date(endDate);
    const periodMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodMs).toISOString().split("T")[0];
    const prevEnd = new Date(start.getTime() - 1).toISOString().split("T")[0];

    const prevParams = new URLSearchParams({
      ids: `channel==${channelId}`,
      startDate: prevStart,
      endDate: prevEnd,
      metrics: "views,estimatedMinutesWatched",
      dimensions: "day",
      sort: "day",
    });

    const prevRes = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${prevParams}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    let previousTotals = { total_views: 0, total_watch_time: 0 };
    if (prevRes.ok) {
      const prevData = await prevRes.json();
      const prevRows: YouTubeAnalyticsRow[] = prevData.rows || [];
      previousTotals = prevRows.reduce<{ total_views: number; total_watch_time: number }>(
        (acc, row) => ({
          total_views: acc.total_views + (Number(row[1]) || 0),
          total_watch_time: acc.total_watch_time + (Number(row[2]) || 0),
        }),
        { total_views: 0, total_watch_time: 0 }
      );
    }

    return NextResponse.json({ aggregates, totals, previousTotals });
  } catch (err) {
    return NextResponse.json(
      { message: (err as Error).message },
      { status: 500 }
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface YouTubeVideoStat {
  title: string;
  publishedAt: string | null; // ISO date
  views: number;
  viewsPercent: number;
  watchTimeHours: number;
  likes: number;
  subscribersGained: number;
  avgViewDurationSeconds: number;
  avgViewPercentage: number;
}

export interface YouTubeTopVideosResponse {
  videos: YouTubeVideoStat[];
  channelSummary: {
    totalViews: number;
    totalWatchTimeHours: number;
    totalSubscribersGained: number;
    totalLikes: number;
  };
  insights: string[];
}

async function refreshToken(clientId: string, clientSecret: string, refreshTokenStr: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenStr,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token?: string };
  return data.access_token || null;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const startDate = sp.get("startDate");
  const endDate = sp.get("endDate");
  const filterChannelId = sp.get("channelId") || null; // optional
  const filterPlaylistId = sp.get("playlistId") || null; // optional — filter to a specific playlist

  if (!startDate || !endDate) {
    return NextResponse.json({ message: "startDate and endDate required" }, { status: 400 });
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID || "";
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    return NextResponse.json({ message: "YouTube OAuth not configured" }, { status: 501 });
  }

  try {
    const supabase = createClient();
    const { data: ytSource } = await supabase
      .from("data_sources")
      .select("config")
      .eq("platform", "youtube")
      .single() as { data: { config: Record<string, unknown> } | null; error: unknown };

    const config = ytSource?.config as {
      channelIds?: string[];
      channelCredentials?: Record<string, { refresh_token: string }>;
    } | null;

    let channelIds = config?.channelIds || [];
    if (filterChannelId) channelIds = channelIds.filter((id) => id === filterChannelId);
    if (channelIds.length === 0) {
      return NextResponse.json({ videos: [], channelSummary: { totalViews: 0, totalWatchTimeHours: 0, totalSubscribersGained: 0, totalLikes: 0 }, insights: [] });
    }

    type VideoAccum = {
      title: string;
      publishedAt: string | null;
      views: number;
      watchTimeMinutes: number;
      likes: number;
      subscribersGained: number;
      avgViewDurationSeconds: number;
      avgViewPercentage: number;
      count: number;
    };

    const allVideos = new Map<string, VideoAccum>();

    for (const channelId of channelIds) {
      try {
        const creds = config?.channelCredentials?.[channelId];
        const rt = creds?.refresh_token || process.env.YOUTUBE_OAUTH_REFRESH_TOKEN || "";
        if (!rt) continue;

        const accessToken = await refreshToken(clientId, clientSecret, rt);
        if (!accessToken) continue;

        // If filtering by playlist, fetch video IDs from the playlist first
        let playlistVideoIds: string[] | null = null;
        if (filterPlaylistId) {
          const plRes = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${filterPlaylistId}&maxResults=50`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (plRes.ok) {
            const plJson = await plRes.json() as { items?: { contentDetails: { videoId: string } }[] };
            playlistVideoIds = (plJson.items || []).map((item) => item.contentDetails.videoId);
          }
          // If we couldn't fetch the playlist or it's empty, skip this channel
          if (!playlistVideoIds || playlistVideoIds.length === 0) continue;
        }

        const params = new URLSearchParams({
          ids: `channel==${channelId}`,
          startDate,
          endDate,
          metrics: "views,likes,estimatedMinutesWatched,subscribersGained,averageViewDuration,averageViewPercentage",
          dimensions: "video",
          sort: "-views",
          maxResults: "50",
        });
        if (playlistVideoIds) params.set("filters", `video==${playlistVideoIds.join(",")}`);
        const analyticsRes = await fetch(
          `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!analyticsRes.ok) continue;
        const json = await analyticsRes.json() as {
          rows?: [string, number, number, number, number, number, number][];
        };
        const rows = json.rows || [];
        if (rows.length === 0) continue;

        // Get titles
        const videoIds = rows.map((r) => r[0]).join(",");
        const dataRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const titleMap = new Map<string, string>();
        const publishedMap = new Map<string, string>();
        if (dataRes.ok) {
          const dj = await dataRes.json() as { items?: { id: string; snippet: { title: string; publishedAt: string } }[] };
          for (const item of dj.items || []) {
            titleMap.set(item.id, item.snippet.title);
            publishedMap.set(item.id, item.snippet.publishedAt);
          }
        }

        for (const [videoId, views, likes, watchMinutes, subs, avgDur, avgPct] of rows) {
          const ex = allVideos.get(videoId);
          if (ex) {
            ex.views += views;
            ex.watchTimeMinutes += watchMinutes;
            ex.likes += likes;
            ex.subscribersGained += subs;
            ex.avgViewDurationSeconds = (ex.avgViewDurationSeconds * ex.count + avgDur) / (ex.count + 1);
            ex.avgViewPercentage = (ex.avgViewPercentage * ex.count + avgPct) / (ex.count + 1);
            ex.count += 1;
          } else {
            allVideos.set(videoId, {
              title: titleMap.get(videoId) || videoId,
              publishedAt: publishedMap.get(videoId) || null,
              views, watchTimeMinutes: watchMinutes, likes,
              subscribersGained: subs, avgViewDurationSeconds: avgDur,
              avgViewPercentage: avgPct, count: 1,
            });
          }
        }
      } catch {
        // skip channel
      }
    }

    const sorted = Array.from(allVideos.values()).sort((a, b) => b.views - a.views).filter((v) => v.views > 0);
    const totalViews = sorted.reduce((s, v) => s + v.views, 0) || 1;
    const totalWatchMinutes = sorted.reduce((s, v) => s + v.watchTimeMinutes, 0);
    const totalSubs = sorted.reduce((s, v) => s + v.subscribersGained, 0);
    const totalLikes = sorted.reduce((s, v) => s + v.likes, 0);

    const videos: YouTubeVideoStat[] = sorted.slice(0, 50).map((v) => ({
      title: v.title,
      publishedAt: v.publishedAt,
      views: v.views,
      viewsPercent: Math.round((v.views / totalViews) * 1000) / 10,
      watchTimeHours: Math.round((v.watchTimeMinutes / 60) * 10) / 10,
      likes: v.likes,
      subscribersGained: v.subscribersGained,
      avgViewDurationSeconds: Math.round(v.avgViewDurationSeconds),
      avgViewPercentage: Math.round(v.avgViewPercentage * 10) / 10,
    }));

    const insights: string[] = [];
    if (videos.length > 0) {
      const top = videos[0];
      insights.push(`"${top.title.length > 50 ? top.title.slice(0, 50) + "…" : top.title}" è il video più visto con il ${top.viewsPercent}% delle viste totali.`);
      if (totalSubs > 0) {
        const bestSub = [...videos].sort((a, b) => b.subscribersGained - a.subscribersGained)[0];
        if (bestSub.subscribersGained > 0)
          insights.push(`"${bestSub.title.slice(0, 40)}${bestSub.title.length > 40 ? "…" : ""}" ha portato ${bestSub.subscribersGained} nuovi iscritti.`);
      }
      const bestRet = [...videos].sort((a, b) => b.avgViewPercentage - a.avgViewPercentage)[0];
      if (bestRet.avgViewPercentage > 0)
        insights.push(`Miglior retention: "${bestRet.title.slice(0, 35)}${bestRet.title.length > 35 ? "…" : ""}" con ${bestRet.avgViewPercentage}% di visione media.`);
      const avgPct = videos.reduce((s, v) => s + v.avgViewPercentage, 0) / videos.length;
      insights.push(avgPct > 50
        ? `Retention media eccellente: ${avgPct.toFixed(1)}% del contenuto guardato in media.`
        : `Retention media: ${avgPct.toFixed(1)}%. Intro più brevi potrebbero migliorare il completamento.`);
    }

    const result: YouTubeTopVideosResponse = {
      videos,
      channelSummary: {
        totalViews,
        totalWatchTimeHours: Math.round((totalWatchMinutes / 60) * 10) / 10,
        totalSubscribersGained: totalSubs,
        totalLikes,
      },
      insights,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("YouTube top-videos error:", err);
    return NextResponse.json({ message: (err as Error).message }, { status: 500 });
  }
}

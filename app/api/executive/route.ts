import { NextResponse, type NextRequest } from "next/server";
import { GA4Connector } from "@/lib/connectors/ga4";
import { createClient } from "@/lib/supabase/server";
import type { NormalizedDailyAggregate } from "@/lib/connectors/types";
import type {
  GA4TrafficSource,
  GA4TopPage,
  GA4Geographic,
  GA4Device,
} from "@/lib/connectors/ga4";

export const maxDuration = 30;

// ── Helpers ──────────────────────────────────────────────

function previousPeriod(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const ms = end.getTime() - start.getTime();
  return {
    prevStart: new Date(start.getTime() - ms).toISOString().split("T")[0],
    prevEnd: new Date(start.getTime() - 86400000).toISOString().split("T")[0],
  };
}

function summariseGA4(rows: NormalizedDailyAggregate[]) {
  const days = rows.length || 1;
  const totals = rows.reduce(
    (a, r) => ({
      sessions: a.sessions + (r.sessions || 0),
      users: a.users + (r.users || 0),
      pageViews: a.pageViews + (r.page_views || 0),
      avgSessionDuration: a.avgSessionDuration + (r.avg_session_duration || 0),
      bounceRate: a.bounceRate + (r.bounce_rate || 0),
    }),
    { sessions: 0, users: 0, pageViews: 0, avgSessionDuration: 0, bounceRate: 0 }
  );
  totals.avgSessionDuration /= days;
  totals.bounceRate /= days;
  return totals;
}

function withPercentage<T extends { sessions: number }>(
  items: T[],
): (T & { percentage: number })[] {
  const total = items.reduce((s, i) => s + i.sessions, 0) || 1;
  return items.map((i) => ({ ...i, percentage: Math.round((i.sessions / total) * 1000) / 10 }));
}

// ── YouTube data types ──────────────────────────────────

export interface YouTubeVideoStat {
  title: string;
  views: number;
  viewsPercent: number;
  watchTimeHours: number;
  likes: number;
  subscribersGained: number;
  avgViewDurationSeconds: number;
  avgViewPercentage: number; // % of video watched
}

export interface YouTubeChannelSummary {
  totalViews: number;
  totalWatchTimeHours: number;
  totalSubscribersGained: number;
  totalLikes: number;
}

export interface YouTubeResult {
  videos: YouTubeVideoStat[];
  channelSummary: YouTubeChannelSummary;
  insights: string[];
}

// ── YouTube top videos (direct Analytics API, not DB) ─────

async function fetchTopYouTubeVideos(
  startDate: string,
  endDate: string,
): Promise<YouTubeResult> {
  const empty: YouTubeResult = {
    videos: [],
    channelSummary: { totalViews: 0, totalWatchTimeHours: 0, totalSubscribersGained: 0, totalLikes: 0 },
    insights: [],
  };

  const clientId = process.env.YOUTUBE_CLIENT_ID || "";
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) return empty;

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

    const channelIds = config?.channelIds || [];
    if (channelIds.length === 0) return empty;

    type VideoAccum = {
      title: string;
      views: number;
      watchTimeMinutes: number;
      likes: number;
      subscribersGained: number;
      avgViewDurationSeconds: number;
      avgViewPercentage: number;
      count: number; // for averaging per-video averages
    };

    const allVideos = new Map<string, VideoAccum>();

    for (const channelId of channelIds) {
      try {
        const creds = config?.channelCredentials?.[channelId];
        const refreshToken = creds?.refresh_token || process.env.YOUTUBE_OAUTH_REFRESH_TOKEN || "";
        if (!refreshToken) continue;

        // Refresh access token
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });
        if (!tokenRes.ok) continue;
        const { access_token: accessToken } = await tokenRes.json() as { access_token: string };

        // Top videos: views, likes, watch time, subscribers, avg duration, avg % watched
        const analyticsParams = new URLSearchParams({
          ids: `channel==${channelId}`,
          startDate,
          endDate,
          metrics: "views,likes,estimatedMinutesWatched,subscribersGained,averageViewDuration,averageViewPercentage",
          dimensions: "video",
          sort: "-views",
          maxResults: "10",
        });
        const analyticsRes = await fetch(
          `https://youtubeanalytics.googleapis.com/v2/reports?${analyticsParams}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!analyticsRes.ok) continue;
        const analyticsJson = await analyticsRes.json() as {
          rows?: [string, number, number, number, number, number, number][];
        };
        const rows = analyticsJson.rows || [];
        if (rows.length === 0) continue;

        // Fetch video titles from YouTube Data API
        const videoIds = rows.map((r) => r[0]).join(",");
        const dataRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const titleMap = new Map<string, string>();
        if (dataRes.ok) {
          const dataJson = await dataRes.json() as { items?: { id: string; snippet: { title: string } }[] };
          for (const item of dataJson.items || []) {
            titleMap.set(item.id, item.snippet.title);
          }
        }

        for (const [videoId, views, likes, watchMinutes, subs, avgDur, avgPct] of rows) {
          const existing = allVideos.get(videoId);
          if (existing) {
            existing.views += views;
            existing.watchTimeMinutes += watchMinutes;
            existing.likes += likes;
            existing.subscribersGained += subs;
            existing.avgViewDurationSeconds = (existing.avgViewDurationSeconds * existing.count + avgDur) / (existing.count + 1);
            existing.avgViewPercentage = (existing.avgViewPercentage * existing.count + avgPct) / (existing.count + 1);
            existing.count += 1;
          } else {
            allVideos.set(videoId, {
              title: titleMap.get(videoId) || videoId,
              views,
              watchTimeMinutes: watchMinutes,
              likes,
              subscribersGained: subs,
              avgViewDurationSeconds: avgDur,
              avgViewPercentage: avgPct,
              count: 1,
            });
          }
        }
      } catch {
        // skip failing channel
      }
    }

    if (allVideos.size === 0) return empty;

    const sorted = Array.from(allVideos.values())
      .sort((a, b) => b.views - a.views)
      .filter((v) => v.views > 0);

    const totalViews = sorted.reduce((s, v) => s + v.views, 0) || 1;
    const totalWatchMinutes = sorted.reduce((s, v) => s + v.watchTimeMinutes, 0);
    const totalSubs = sorted.reduce((s, v) => s + v.subscribersGained, 0);
    const totalLikes = sorted.reduce((s, v) => s + v.likes, 0);

    const videos: YouTubeVideoStat[] = sorted.slice(0, 10).map((v) => ({
      title: v.title,
      views: v.views,
      viewsPercent: Math.round((v.views / totalViews) * 1000) / 10,
      watchTimeHours: Math.round((v.watchTimeMinutes / 60) * 10) / 10,
      likes: v.likes,
      subscribersGained: v.subscribersGained,
      avgViewDurationSeconds: Math.round(v.avgViewDurationSeconds),
      avgViewPercentage: Math.round(v.avgViewPercentage * 10) / 10,
    }));

    // Generate YouTube-specific insights
    const ytInsights: string[] = [];
    if (videos.length > 0) {
      const top = videos[0];
      ytInsights.push(
        `"${top.title.length > 50 ? top.title.slice(0, 50) + "…" : top.title}" è il video più visto con ${top.viewsPercent}% delle viste totali.`
      );
      if (totalSubs > 0) {
        const bestSubVideo = [...videos].sort((a, b) => b.subscribersGained - a.subscribersGained)[0];
        if (bestSubVideo.subscribersGained > 0) {
          ytInsights.push(
            `"${bestSubVideo.title.length > 40 ? bestSubVideo.title.slice(0, 40) + "…" : bestSubVideo.title}" ha portato ${bestSubVideo.subscribersGained} nuovi iscritti nel periodo.`
          );
        }
      }
      const bestRetention = [...videos].sort((a, b) => b.avgViewPercentage - a.avgViewPercentage)[0];
      if (bestRetention.avgViewPercentage > 0) {
        ytInsights.push(
          `Il video con la retention migliore è "${bestRetention.title.length > 35 ? bestRetention.title.slice(0, 35) + "…" : bestRetention.title}" con una visione media del ${bestRetention.avgViewPercentage}% del contenuto.`
        );
      }
      const avgPct = videos.reduce((s, v) => s + v.avgViewPercentage, 0) / videos.length;
      if (avgPct > 50) {
        ytInsights.push(`Retention media eccellente: ${avgPct.toFixed(1)}% del contenuto guardato in media. Il pubblico è molto coinvolto.`);
      } else if (avgPct > 30) {
        ytInsights.push(`Retention media del ${avgPct.toFixed(1)}%. Considera intro più brevi per aumentare il completamento.`);
      }
    }

    return {
      videos,
      channelSummary: {
        totalViews,
        totalWatchTimeHours: Math.round((totalWatchMinutes / 60) * 10) / 10,
        totalSubscribersGained: totalSubs,
        totalLikes,
      },
      insights: ytInsights,
    };
  } catch {
    return empty;
  }
}

// ── Insight generator ────────────────────────────────────

function generateInsights(
  sessionsChange: number,
  bounceRateDelta: number,
  trafficSources: { channel: string; percentage: number }[],
  publicationLift: number,
  bestContent: { title: string; sessionsDeltaPercent: number } | null,
  contentTotal: number,
  prevContentTotal: number,
): { insights: string[]; recommendation: string } {
  const insights: string[] = [];

  // Sessions trend
  if (sessionsChange > 15) {
    insights.push(
      `Il traffico del sito è in crescita significativa (+${sessionsChange.toFixed(1)}%) rispetto al periodo precedente.`
    );
  } else if (sessionsChange < -15) {
    insights.push(
      `Il traffico del sito è in calo (${sessionsChange.toFixed(1)}%). Verificare frequenza di pubblicazione e posizionamento SEO.`
    );
  } else {
    insights.push(
      `Il traffico del sito è stabile rispetto al periodo precedente (${sessionsChange >= 0 ? "+" : ""}${sessionsChange.toFixed(1)}%).`
    );
  }

  // Bounce rate
  if (bounceRateDelta < -5) {
    insights.push(
      `La qualità del traffico sta migliorando: il bounce rate è sceso di ${Math.abs(bounceRateDelta).toFixed(1)} punti.`
    );
  } else if (bounceRateDelta > 5) {
    insights.push(
      `Attenzione: il bounce rate è salito di ${bounceRateDelta.toFixed(1)} punti. Verificare le pagine di atterraggio.`
    );
  }

  // Top traffic source
  const organic = trafficSources.find(
    (s) => s.channel.toLowerCase().includes("organic")
  );
  if (organic && organic.percentage > 40) {
    insights.push(
      `Il traffico organico (SEO) è la fonte principale (${organic.percentage.toFixed(1)}%). Il posizionamento sta funzionando.`
    );
  }

  // Publication lift
  if (publicationLift > 20) {
    insights.push(
      `I contenuti pubblicati generano un aumento medio del ${publicationLift.toFixed(0)}% nel traffico del sito.`
    );
  }

  // Best content
  if (bestContent && bestContent.sessionsDeltaPercent > 50) {
    insights.push(
      `${bestContent.title} ha avuto un impatto significativo: +${bestContent.sessionsDeltaPercent.toFixed(0)}% traffico nelle 48h successive.`
    );
  }

  // Recommendation
  let recommendation: string;
  if (sessionsChange < -15 && contentTotal < prevContentTotal) {
    recommendation = "Aumentare la frequenza di pubblicazione.";
  } else if (sessionsChange > 15 && publicationLift > 20) {
    recommendation =
      "Mantenere la frequenza attuale, i contenuti stanno trainando il traffico.";
  } else if (bounceRateDelta > 5) {
    recommendation = "Migliorare le pagine di atterraggio principali.";
  } else {
    recommendation =
      "Continuare a monitorare l'andamento e mantenere la cadenza editoriale.";
  }

  return { insights, recommendation };
}

// ── Route handler ────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const startDate = sp.get("startDate");
    const endDate = sp.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { message: "startDate and endDate required" },
        { status: 400 }
      );
    }

    const { prevStart, prevEnd } = previousPeriod(startDate, endDate);
    const ga4 = new GA4Connector();
    const supabase = createClient();

    // ── Parallel fetch: GA4 (6 calls) + Supabase (3 queries) + YouTube top videos ──

    const [
      ga4Daily,
      ga4Traffic,
      ga4Pages,
      ga4Geo,
      ga4Device,
      ga4PrevDaily,
      episodesResult,
      prevEpisodesResult,
      syncStatusResult,
      youtubeData,
    ] = await Promise.all([
      ga4.fetchDailyAggregates(startDate, endDate),
      ga4.fetchTrafficSources(startDate, endDate) as Promise<GA4TrafficSource[]>,
      ga4.fetchTopPages(startDate, endDate) as Promise<GA4TopPage[]>,
      ga4.fetchGeographic(startDate, endDate) as Promise<GA4Geographic[]>,
      ga4.fetchDeviceBreakdown(startDate, endDate) as Promise<GA4Device[]>,
      ga4.fetchDailyAggregates(prevStart, prevEnd),
      // Episodes in current period (for editorial impact)
      supabase
        .from("episodes")
        .select("id,title,pub_date")
        .gte("pub_date", startDate)
        .lte("pub_date", endDate)
        .order("pub_date", { ascending: true }),
      // Episodes in previous period (count only)
      supabase
        .from("episodes")
        .select("id", { count: "exact", head: true })
        .gte("pub_date", prevStart)
        .lte("pub_date", prevEnd),
      // Last sync time for GA4
      supabase
        .from("data_sources")
        .select("last_sync_at")
        .eq("platform", "ga4")
        .single(),
      // Top YouTube videos directly from Analytics API
      fetchTopYouTubeVideos(startDate, endDate),
    ]);

    // ── Compute site KPIs ──

    const summary = summariseGA4(ga4Daily);
    const prevSummary = summariseGA4(ga4PrevDaily);

    // ── Episodes: classify video vs podcast ──

    const episodes: { id: string; title: string; pub_date: string }[] =
      (episodesResult.data as { id: string; title: string; pub_date: string }[]) || [];

    const prevContentTotal = prevEpisodesResult.count || 0;

    // ── Content markers for chart (all episodes = podcasts from Megaphone) ──

    const contentMarkers = episodes.map((e) => ({
      date: e.pub_date,
      type: "podcast" as "video" | "podcast",
      title: e.title,
    }));

    // ── Site trend + editorial impact ──

    const daily = ga4Daily.map((r) => ({
      date: r.date,
      sessions: r.sessions || 0,
      users: r.users || 0,
    }));

    const publicationDatesArr = episodes.map((e) => e.pub_date);
    const publicationDates = new Set(publicationDatesArr);

    const daysWithPub = daily.filter((d) => publicationDates.has(d.date));
    const daysWithoutPub = daily.filter((d) => !publicationDates.has(d.date));

    const avgWith =
      daysWithPub.length > 0
        ? daysWithPub.reduce((s, d) => s + d.sessions, 0) / daysWithPub.length
        : 0;
    const avgWithout =
      daysWithoutPub.length > 0
        ? daysWithoutPub.reduce((s, d) => s + d.sessions, 0) / daysWithoutPub.length
        : 0;
    const publicationLift =
      avgWithout > 0 ? ((avgWith - avgWithout) / avgWithout) * 100 : 0;

    // 48h effect: for each publication, average sessions on pub_date + next day
    const dailyMap = new Map(daily.map((d) => [d.date, d.sessions]));
    const windows48h: number[] = [];
    const uniquePubDates = Array.from(publicationDates);
    for (const pubDate of uniquePubDates) {
      const d0 = dailyMap.get(pubDate) || 0;
      const nextDay = new Date(new Date(pubDate).getTime() + 86400000)
        .toISOString()
        .split("T")[0];
      const d1 = dailyMap.get(nextDay) || 0;
      windows48h.push((d0 + d1) / 2);
    }
    const mean48h =
      windows48h.length > 0
        ? windows48h.reduce((s, v) => s + v, 0) / windows48h.length
        : 0;
    const avg48hEffect =
      avgWithout > 0 ? ((mean48h - avgWithout) / avgWithout) * 100 : 0;

    // Best content by 48h delta
    type BestContent = {
      title: string;
      type: "video" | "podcast";
      sessionsDelta: number;
      sessionsDeltaPercent: number;
    };
    let bestContent: BestContent | null = null;

    if (episodes.length > 0 && avgWithout > 0) {
      let maxDelta = -Infinity;
      for (const ep of episodes) {
        const d0 = dailyMap.get(ep.pub_date) || 0;
        const nextDay = new Date(new Date(ep.pub_date).getTime() + 86400000)
          .toISOString()
          .split("T")[0];
        const d1 = dailyMap.get(nextDay) || 0;
        const delta = d0 + d1 - 2 * avgWithout;
        if (delta > maxDelta) {
          maxDelta = delta;
          bestContent = {
            title: ep.title,
            type: "podcast",
            sessionsDelta: Math.round(delta),
            sessionsDeltaPercent: Math.round(
              (delta / (2 * avgWithout)) * 100
            ),
          };
        }
      }
      // Only show if positive
      if (bestContent && bestContent.sessionsDelta <= 0) bestContent = null;
    }

    // Trend summary
    const totalSessions = daily.reduce((s, d) => s + d.sessions, 0);
    const avgDailySessions =
      daily.length > 0 ? Math.round(totalSessions / daily.length) : 0;
    const bestDay = daily.reduce(
      (best, d) => (d.sessions > best.sessions ? d : best),
      { date: "", sessions: 0 }
    );

    // topYouTubeContent is already resolved from Promise.all above
    // topAudioContent: SoundCloud data not yet available (token needs reconnection)
    const topAudioContent: { title: string; plays: number; isLifetime: true }[] = [];

    // ── Traffic sources with percentages ──

    const trafficSources = withPercentage(
      (ga4Traffic || []).slice(0, 6).map((s) => ({
        channel: s.channel,
        sessions: s.sessions,
        users: s.users,
      }))
    );

    const topCountries = withPercentage(
      (ga4Geo || []).slice(0, 8).map((g) => ({
        country: g.country,
        sessions: g.sessions,
      }))
    );

    const deviceBreakdown = withPercentage(
      (ga4Device || []).map((d) => ({
        device: d.device,
        sessions: d.sessions,
      }))
    );

    // ── Top pages ──

    const topPages = (ga4Pages || []).slice(0, 10).map((p) => ({
      page: p.page,
      views: p.views,
      users: p.users,
      avgDuration: Math.round(p.avg_duration * 10) / 10,
    }));

    // ── Insights ──

    const sessionsChange =
      prevSummary.sessions > 0
        ? ((summary.sessions - prevSummary.sessions) / prevSummary.sessions) * 100
        : 0;
    const bounceRateDelta = summary.bounceRate - prevSummary.bounceRate;

    const { insights, recommendation } = generateInsights(
      sessionsChange,
      bounceRateDelta,
      trafficSources,
      publicationLift,
      bestContent,
      episodes.length,
      prevContentTotal,
    );

    // ── Last sync ──

    const lastSyncAt =
      (syncStatusResult.data as { last_sync_at: string | null } | null)
        ?.last_sync_at || null;

    // ── Response ──

    return NextResponse.json({
      period: {
        start: startDate,
        end: endDate,
        prevStart,
        prevEnd,
      },
      siteKPIs: {
        sessions: summary.sessions,
        prevSessions: prevSummary.sessions,
        users: summary.users,
        prevUsers: prevSummary.users,
        pageViews: summary.pageViews,
        prevPageViews: prevSummary.pageViews,
        avgSessionDuration: Math.round(summary.avgSessionDuration * 10) / 10,
        prevAvgSessionDuration:
          Math.round(prevSummary.avgSessionDuration * 10) / 10,
        bounceRate: Math.round(summary.bounceRate * 10) / 10,
        prevBounceRate: Math.round(prevSummary.bounceRate * 10) / 10,
        contentPublished: {
          total: episodes.length,
          videos: 0,
          podcasts: episodes.length,
          prevTotal: prevContentTotal,
        },
      },
      siteTrend: {
        daily,
        contentMarkers,
        summary: {
          avgDailySessions,
          bestDay,
          withPublicationAvg: Math.round(avgWith),
          withoutPublicationAvg: Math.round(avgWithout),
          publicationLift: Math.round(publicationLift * 10) / 10,
        },
      },
      trafficSources,
      topCountries,
      deviceBreakdown,
      topPages,
      topYouTubeContent: youtubeData.videos,
      youtubeChannelSummary: youtubeData.channelSummary,
      youtubeInsights: youtubeData.insights,
      topAudioContent,
      editorialImpact: {
        totalPublished: episodes.length,
        videos: 0,
        podcasts: episodes.length,
        avgSessionsWithPublication: Math.round(avgWith),
        avgSessionsWithoutPublication: Math.round(avgWithout),
        publicationLiftPercent: Math.round(publicationLift * 10) / 10,
        avg48hEffect: Math.round(avg48hEffect * 10) / 10,
        bestContent: bestContent as BestContent | null,
      },
      insights,
      recommendation,
      lastSyncAt,
    });
  } catch (err) {
    console.error("Executive API error:", err);
    return NextResponse.json(
      { message: (err as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}

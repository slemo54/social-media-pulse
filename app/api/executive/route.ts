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

    // ── Parallel fetch: GA4 (6 calls) + Supabase (4 queries) ──

    const [
      ga4Daily,
      ga4Traffic,
      ga4Pages,
      ga4Geo,
      ga4Device,
      ga4PrevDaily,
      episodesResult,
      prevEpisodesResult,
      ytMetricsResult,
      scMetricsResult,
      syncStatusResult,
    ] = await Promise.all([
      ga4.fetchDailyAggregates(startDate, endDate),
      ga4.fetchTrafficSources(startDate, endDate) as Promise<GA4TrafficSource[]>,
      ga4.fetchTopPages(startDate, endDate) as Promise<GA4TopPage[]>,
      ga4.fetchGeographic(startDate, endDate) as Promise<GA4Geographic[]>,
      ga4.fetchDeviceBreakdown(startDate, endDate) as Promise<GA4Device[]>,
      ga4.fetchDailyAggregates(prevStart, prevEnd),
      // Episodes in current period
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
      // YouTube metrics
      supabase
        .from("episode_metrics")
        .select("episode_id,views,likes,watch_time_minutes")
        .eq("platform", "youtube")
        .gte("date", startDate)
        .lte("date", endDate),
      // SoundCloud metrics (lifetime plays stored as views)
      supabase
        .from("episode_metrics")
        .select("episode_id,views")
        .eq("platform", "soundcloud"),
      // Last sync time for GA4
      supabase
        .from("data_sources")
        .select("last_sync_at")
        .eq("platform", "ga4")
        .single(),
    ]);

    // ── Compute site KPIs ──

    const summary = summariseGA4(ga4Daily);
    const prevSummary = summariseGA4(ga4PrevDaily);

    // ── Episodes: classify video vs podcast ──

    const episodes: { id: string; title: string; pub_date: string }[] =
      (episodesResult.data as { id: string; title: string; pub_date: string }[]) || [];

    // Find which episode IDs have YouTube metrics
    const ytEpisodeIds = new Set(
      ((ytMetricsResult.data as { episode_id: string }[]) || []).map(
        (m) => m.episode_id
      )
    );

    const videoEpisodes = episodes.filter((e) => ytEpisodeIds.has(e.id));
    const podcastEpisodes = episodes.filter((e) => !ytEpisodeIds.has(e.id));
    const prevContentTotal = prevEpisodesResult.count || 0;

    // ── Content markers for chart ──

    const contentMarkers = episodes.map((e) => ({
      date: e.pub_date,
      type: (ytEpisodeIds.has(e.id) ? "video" : "podcast") as "video" | "podcast",
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
            type: ytEpisodeIds.has(ep.id) ? "video" : "podcast",
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

    // ── Top YouTube content ──

    const ytMetrics =
      (ytMetricsResult.data as {
        episode_id: string;
        views: number | null;
        likes: number | null;
        watch_time_minutes: number | null;
      }[]) || [];

    const ytByEpisode = new Map<
      string,
      { views: number; likes: number; watchTimeMinutes: number }
    >();
    for (const m of ytMetrics) {
      const existing = ytByEpisode.get(m.episode_id) || {
        views: 0,
        likes: 0,
        watchTimeMinutes: 0,
      };
      existing.views += m.views || 0;
      existing.likes += m.likes || 0;
      existing.watchTimeMinutes += m.watch_time_minutes || 0;
      ytByEpisode.set(m.episode_id, existing);
    }

    // Get episode titles for top YouTube content
    const topYtIds = Array.from(ytByEpisode.entries())
      .sort(([, a], [, b]) => b.views - a.views)
      .slice(0, 5)
      .map(([id]) => id);

    let topYouTubeContent: {
      title: string;
      views: number;
      likes: number;
      watchTimeMinutes: number;
    }[] = [];

    if (topYtIds.length > 0) {
      const { data: ytEps } = await supabase
        .from("episodes")
        .select("id,title")
        .in("id", topYtIds);

      const titleMap = new Map(
        ((ytEps as { id: string; title: string }[]) || []).map((e) => [
          e.id,
          e.title,
        ])
      );

      topYouTubeContent = topYtIds
        .map((id) => {
          const m = ytByEpisode.get(id)!;
          return {
            title: titleMap.get(id) || id,
            views: m.views,
            likes: m.likes,
            watchTimeMinutes: Math.round(m.watchTimeMinutes),
          };
        })
        .filter((c) => c.views > 0);
    }

    // ── Top audio content (SoundCloud lifetime plays) ──

    const scMetrics =
      (scMetricsResult.data as {
        episode_id: string;
        views: number | null;
      }[]) || [];

    const scByEpisode = new Map<string, number>();
    for (const m of scMetrics) {
      const existing = scByEpisode.get(m.episode_id) || 0;
      scByEpisode.set(m.episode_id, Math.max(existing, m.views || 0));
    }

    const topScIds = Array.from(scByEpisode.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id]) => id);

    let topAudioContent: {
      title: string;
      plays: number;
      isLifetime: true;
    }[] = [];

    if (topScIds.length > 0) {
      const { data: scEps } = await supabase
        .from("episodes")
        .select("id,title")
        .in("id", topScIds);

      const scTitleMap = new Map(
        ((scEps as { id: string; title: string }[]) || []).map((e) => [
          e.id,
          e.title,
        ])
      );

      topAudioContent = topScIds
        .map((id) => ({
          title: scTitleMap.get(id) || id,
          plays: scByEpisode.get(id) || 0,
          isLifetime: true as const,
        }))
        .filter((c) => c.plays > 0);
    }

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
          videos: videoEpisodes.length,
          podcasts: podcastEpisodes.length,
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
      topYouTubeContent,
      topAudioContent,
      editorialImpact: {
        totalPublished: episodes.length,
        videos: videoEpisodes.length,
        podcasts: podcastEpisodes.length,
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

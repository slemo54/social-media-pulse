"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, Calendar } from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { PlatformChart } from "@/components/dashboard/platform-chart";
import { EpisodeLifecycle } from "@/components/dashboard/episode-lifecycle";
import { AnomalyBadge } from "@/components/dashboard/anomaly-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatDuration, formatNumber } from "@/lib/utils";
import { PLATFORM_NAMES, PLATFORM_COLORS, PLATFORMS } from "@/lib/constants";

interface EpisodeDetail {
  id: string;
  title: string;
  description: string | null;
  audio_url: string | null;
  duration: number | null;
  pub_date: string | null;
  series: string | null;
  tags: string[] | null;
}

interface EpisodeMetricRow {
  episode_id: string;
  platform: string;
  external_id: string;
  date: string;
  downloads: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  watch_time_minutes: number | null;
}

interface SeriesAvgData {
  avgDownloads: number;
}

export default function EpisodeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const episodeId = params.id as string;

  const { data, isLoading } = useQuery<{
    episode: EpisodeDetail;
    metrics: EpisodeMetricRow[];
  }>({
    queryKey: ["episode", episodeId],
    queryFn: async () => {
      const res = await fetch(`/api/episodes/${episodeId}`);
      if (!res.ok) throw new Error("Failed to fetch episode");
      return res.json();
    },
  });

  const episode = data?.episode;
  const metrics = data?.metrics || [];

  // Aggregate metrics by platform
  const platformTotals = new Map<
    string,
    { downloads: number; views: number; likes: number; comments: number }
  >();
  for (const m of metrics) {
    const existing = platformTotals.get(m.platform) || {
      downloads: 0,
      views: 0,
      likes: 0,
      comments: 0,
    };
    platformTotals.set(m.platform, {
      downloads: existing.downloads + (m.downloads || 0),
      views: existing.views + (m.views || 0),
      likes: existing.likes + (m.likes || 0),
      comments: existing.comments + (m.comments || 0),
    });
  }

  // Total downloads for anomaly badge
  const totalDownloads = Array.from(platformTotals.values()).reduce(
    (s, v) => s + v.downloads,
    0
  );

  // Fetch series average for anomaly detection
  const { data: seriesAvgData } = useQuery<SeriesAvgData>({
    queryKey: ["series-avg", episode?.series],
    enabled: !!episode?.series,
    queryFn: async () => {
      const res = await fetch(`/api/executive?startDate=2020-01-01&endDate=${new Date().toISOString().split("T")[0]}`);
      if (!res.ok) return { avgDownloads: 0 };
      const execData = await res.json();
      const seriesEntry = execData.seriesPerformance?.find(
        (s: { series: string }) => s.series === episode?.series
      );
      return { avgDownloads: seriesEntry?.avgDownloads || 0 };
    },
  });

  // Chart data: group by date with platform values
  const chartByDate = new Map<string, Record<string, unknown>>();
  for (const m of metrics) {
    const existing = chartByDate.get(m.date) || { date: m.date };
    existing[m.platform] =
      (m.downloads || 0) + (m.views || 0);
    chartByDate.set(m.date, existing);
  }
  const chartData = Array.from(chartByDate.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string)
  );

  const chartPlatforms = Array.from(
    new Set(metrics.map((m) => m.platform))
  ).filter((p) => PLATFORMS.includes(p as (typeof PLATFORMS)[number]));

  // Build lifecycle data: cumulative downloads since pub_date
  const lifecycleData = (() => {
    if (!episode?.pub_date || metrics.length === 0) return [];
    const pubDate = new Date(episode.pub_date + "T00:00:00Z");

    // Sort metrics by date
    const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));

    // Accumulate daily downloads
    let cumulative = 0;
    const curve: { day: number; value: number }[] = [];
    const seenDays = new Set<number>();

    for (const m of sorted) {
      const metricDate = new Date(m.date + "T00:00:00Z");
      const dayDiff = Math.floor(
        (metricDate.getTime() - pubDate.getTime()) / 86400000
      );
      if (dayDiff < 0 || dayDiff > 30) continue;
      cumulative += (m.downloads || 0) + (m.views || 0);
      if (!seenDays.has(dayDiff)) {
        seenDays.add(dayDiff);
        curve.push({ day: dayDiff, value: cumulative });
      }
    }

    return [
      {
        episodeId: episode.id,
        title: episode.title,
        pubDate: episode.pub_date || "",
        curve,
      },
    ];
  })();

  return (
    <div className="flex flex-col">
      <Header
        title="Episode Detail"
        userEmail={user?.email || undefined}
        onLogout={signOut}
      />

      <div className="p-6 space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-96" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : episode ? (
          <>
            {/* Metadata */}
            <div className="space-y-3">
              <h2 className="text-2xl font-bold tracking-tight">
                {episode.title}
              </h2>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {episode.pub_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(episode.pub_date)}
                  </span>
                )}
                {episode.duration && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(episode.duration)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {episode.series && (
                  <Badge variant="default">{episode.series}</Badge>
                )}
                {(episode.tags || []).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                <AnomalyBadge
                  episodeDownloads={totalDownloads}
                  seriesAvgDownloads={seriesAvgData?.avgDownloads || 0}
                />
              </div>
              {episode.description && (
                <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
                  {episode.description}
                </p>
              )}
            </div>

            {/* Platform Metrics Cards */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from(platformTotals.entries()).map(([p, totals]) => (
                <Card key={p}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: PLATFORM_COLORS[p] || "#888",
                        }}
                      />
                      {PLATFORM_NAMES[p] || p}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {totals.downloads > 0 && (
                      <p className="text-sm">
                        Downloads:{" "}
                        <span className="font-semibold">
                          {formatNumber(totals.downloads)}
                        </span>
                      </p>
                    )}
                    {totals.views > 0 && (
                      <p className="text-sm">
                        Views:{" "}
                        <span className="font-semibold">
                          {formatNumber(totals.views)}
                        </span>
                      </p>
                    )}
                    {totals.likes > 0 && (
                      <p className="text-sm">
                        Likes:{" "}
                        <span className="font-semibold">
                          {formatNumber(totals.likes)}
                        </span>
                      </p>
                    )}
                    {totals.comments > 0 && (
                      <p className="text-sm">
                        Comments:{" "}
                        <span className="font-semibold">
                          {formatNumber(totals.comments)}
                        </span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Performance Chart */}
            {chartData.length > 0 && (
              <PlatformChart
                data={chartData}
                platforms={chartPlatforms}
                metric="performance"
                title="Episode Performance Over Time"
              />
            )}

            {/* Lifecycle Chart */}
            {lifecycleData.length > 0 && (
              <EpisodeLifecycle episodes={lifecycleData} metric="downloads" />
            )}
          </>
        ) : (
          <p className="text-muted-foreground">Episode not found.</p>
        )}
      </div>
    </div>
  );
}

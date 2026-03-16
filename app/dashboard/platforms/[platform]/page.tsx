"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Download,
  Eye,
  Users,
  Headphones,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { KPICard } from "@/components/dashboard/kpi-card";
import { PlatformChart } from "@/components/dashboard/platform-chart";
import { EpisodeTable } from "@/components/dashboard/episode-table";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useEpisodes } from "@/hooks/useEpisodes";
import { useTriggerSync } from "@/hooks/useSyncStatus";
import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_DATE_RANGE,
  PLATFORM_NAMES,
  PLATFORM_COLORS,
} from "@/lib/constants";
import { formatNumber, calculateChange } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const PLATFORM_ICONS: Record<string, LucideIcon> = {
  megaphone: Download,
  youtube: Eye,
  ga4: Users,
  soundcloud: Headphones,
};

const PLATFORM_METRICS: Record<
  string,
  { primary: string; label: string }
> = {
  megaphone: { primary: "downloads", label: "Downloads" },
  youtube: { primary: "views", label: "Views" },
  ga4: { primary: "sessions", label: "Sessions" },
  soundcloud: { primary: "listeners", label: "Listeners" },
};

export default function PlatformPage() {
  const params = useParams();
  const platform = params.platform as string;
  const { user, signOut } = useAuth();
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE);
  const triggerSync = useTriggerSync();

  const { data: analytics, isLoading: analyticsLoading } = useAnalytics({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    platform,
  });

  const { episodes, isLoading: episodesLoading } = useEpisodes({});

  const totals = analytics?.totals || {};
  const prevTotals = analytics?.previousTotals || {};
  const platformName = PLATFORM_NAMES[platform] || platform;
  const PlatformIcon = PLATFORM_ICONS[platform] || Download;
  const metric = PLATFORM_METRICS[platform] || {
    primary: "downloads",
    label: "Total",
  };

  const chartData = useMemo(() => {
    if (!analytics?.aggregates) return [];
    return (
      analytics.aggregates as Array<{
        date: string;
        platform: string;
        downloads: number | null;
        views: number | null;
        sessions: number | null;
        listeners: number | null;
      }>
    ).map((row) => ({
      date: row.date,
      [platform]:
        row.downloads || row.views || row.sessions || row.listeners || 0,
    }));
  }, [analytics?.aggregates, platform]);

  return (
    <div className="flex flex-col">
      <Header
        title={platformName}
        description={`Detailed analytics for ${platformName}`}
        userEmail={user?.email || undefined}
        onLogout={signOut}
      />

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={setDateRange}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerSync.mutate({ platform })}
              disabled={triggerSync.isPending}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Sync Now
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                triggerSync.mutate({ platform, fullSync: true })
              }
              disabled={triggerSync.isPending}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Full Sync
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title={metric.label}
            value={formatNumber(totals[metric.primary] || 0)}
            change={calculateChange(
              totals[metric.primary] || 0,
              prevTotals[metric.primary] || 0
            )}
            icon={PlatformIcon}
            color={PLATFORM_COLORS[platform]}
            loading={analyticsLoading}
          />
          <KPICard
            title="Likes"
            value={formatNumber(totals.likes || 0)}
            change={calculateChange(
              totals.likes || 0,
              prevTotals.likes || 0
            )}
            icon={PlatformIcon}
            loading={analyticsLoading}
          />
          <KPICard
            title="Comments"
            value={formatNumber(totals.comments || 0)}
            change={calculateChange(
              totals.comments || 0,
              prevTotals.comments || 0
            )}
            icon={PlatformIcon}
            loading={analyticsLoading}
          />
          <KPICard
            title="Shares"
            value={formatNumber(totals.shares || 0)}
            change={calculateChange(
              totals.shares || 0,
              prevTotals.shares || 0
            )}
            icon={PlatformIcon}
            loading={analyticsLoading}
          />
        </div>

        {/* Platform Chart */}
        <PlatformChart
          data={chartData}
          platforms={[platform]}
          metric={metric.primary}
          title={`${platformName} Over Time`}
          loading={analyticsLoading}
        />

        {/* Episodes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Episodes</CardTitle>
          </CardHeader>
          <CardContent>
            <EpisodeTable
              episodes={episodes.slice(0, 20)}
              loading={episodesLoading}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

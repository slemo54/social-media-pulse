"use client";

import { useState, useMemo } from "react";
import { Download, Eye, Users, Headphones } from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { KPICard } from "@/components/dashboard/kpi-card";
import { PlatformChart } from "@/components/dashboard/platform-chart";
import { EpisodeTable } from "@/components/dashboard/episode-table";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { SyncStatusBadge } from "@/components/dashboard/sync-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useEpisodes } from "@/hooks/useEpisodes";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_DATE_RANGE, PLATFORMS, PLATFORM_NAMES, PLATFORM_COLORS } from "@/lib/constants";
import { formatNumber, calculateChange } from "@/lib/utils";

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE);

  const { data: analytics, isLoading: analyticsLoading } = useAnalytics({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const { episodes, isLoading: episodesLoading } = useEpisodes({ page: 1 });
  const { data: dataSources, isLoading: syncLoading } = useSyncStatus();

  const totals = analytics?.totals || {};
  const prevTotals = analytics?.previousTotals || {};

  // Transform aggregates into chart data: group by date, with platform values
  const chartData = useMemo(() => {
    if (!analytics?.aggregates) return [];
    const byDate = new Map<string, Record<string, unknown>>();

    for (const row of analytics.aggregates as Array<{
      date: string;
      platform: string;
      total_downloads: number | null;
      total_views: number | null;
      sessions: number | null;
      unique_listeners: number | null;
    }>) {
      const existing = byDate.get(row.date) || { date: row.date };
      const value =
        row.total_downloads || row.total_views || row.sessions || row.unique_listeners || 0;
      existing[row.platform] = value;
      byDate.set(row.date, existing);
    }

    return Array.from(byDate.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string)
    );
  }, [analytics?.aggregates]);

  return (
    <div className="flex flex-col">
      <Header
        title="Dashboard"
        description="Overview of all platforms"
        userEmail={user?.email || undefined}
        onLogout={signOut}
      />

      <div className="p-6 space-y-6">
        <DateRangePicker
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
          onChange={setDateRange}
        />

        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Total Downloads"
            value={formatNumber(totals.total_downloads || 0)}
            change={calculateChange(
              totals.total_downloads || 0,
              prevTotals.total_downloads || 0
            )}
            icon={Download}
            color={PLATFORM_COLORS.megaphone}
            loading={analyticsLoading}
          />
          <KPICard
            title="Total Views"
            value={formatNumber(totals.total_views || 0)}
            change={calculateChange(
              totals.total_views || 0,
              prevTotals.total_views || 0
            )}
            icon={Eye}
            color={PLATFORM_COLORS.youtube}
            loading={analyticsLoading}
          />
          <KPICard
            title="Total Sessions"
            value={formatNumber(totals.sessions || 0)}
            change={calculateChange(
              totals.sessions || 0,
              prevTotals.sessions || 0
            )}
            icon={Users}
            color={PLATFORM_COLORS.ga4}
            loading={analyticsLoading}
          />
          <KPICard
            title="Total Listens"
            value={formatNumber(totals.unique_listeners || 0)}
            change={calculateChange(
              totals.unique_listeners || 0,
              prevTotals.unique_listeners || 0
            )}
            icon={Headphones}
            color={PLATFORM_COLORS.soundcloud}
            loading={analyticsLoading}
          />
        </div>

        {/* Platform Chart */}
        <PlatformChart
          data={chartData}
          platforms={[...PLATFORMS]}
          metric="all"
          title="Platform Performance"
          loading={analyticsLoading}
        />

        {/* Top Episodes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Episodes</CardTitle>
          </CardHeader>
          <CardContent>
            <EpisodeTable
              episodes={episodes.slice(0, 10)}
              loading={episodesLoading}
            />
          </CardContent>
        </Card>

        {/* Sync Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sync Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {syncLoading
                ? PLATFORMS.map((p) => (
                    <div key={p} className="flex items-center gap-3">
                      <span className="text-sm font-medium">
                        {PLATFORM_NAMES[p]}
                      </span>
                      <SyncStatusBadge status="never" lastSync={null} />
                    </div>
                  ))
                : (dataSources || []).map((ds) => (
                    <div key={ds.platform} className="flex items-center gap-3">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor:
                            PLATFORM_COLORS[ds.platform] || "#888",
                        }}
                      />
                      <span className="text-sm font-medium">
                        {PLATFORM_NAMES[ds.platform] || ds.platform}
                      </span>
                      <SyncStatusBadge
                        status={ds.last_sync_status || "never"}
                        lastSync={ds.last_sync_at}
                      />
                    </div>
                  ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

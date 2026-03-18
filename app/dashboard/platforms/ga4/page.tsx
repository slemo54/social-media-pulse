"use client";

import { useState, useMemo, useEffect } from "react";
import {
  TrendingUp,
  Users,
  Globe,
  Smartphone,
  Share2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { KPICard } from "@/components/dashboard/kpi-card";
import { PlatformChart } from "@/components/dashboard/platform-chart";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useTriggerSync } from "@/hooks/useSyncStatus";
import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_DATE_RANGE,
  PLATFORM_COLORS,
} from "@/lib/constants";
import { formatNumber } from "@/lib/utils";
import { calculateChange as calculateChangeUtil } from "@/lib/utils";

interface GA4Insights {
  summary: {
    sessions: number;
    users: number;
    page_views: number;
    avg_session_duration: number;
    bounce_rate: number;
  };
  previousSummary?: {
    sessions: number;
    users: number;
    page_views: number;
    avg_session_duration: number;
    bounce_rate: number;
  };
  dailyAggregates: Array<{
    date: string;
    sessions: number;
    users: number;
    page_views: number;
    avg_session_duration: number;
    bounce_rate: number;
  }>;
  trafficSources: Array<{
    channel: string;
    sessions: number;
    users: number;
    bounce_rate: number;
  }>;
  topPages: Array<{
    page: string;
    sessions: number;
    users: number;
    views: number;
    avg_duration: number;
  }>;
  geographic: Array<{
    country: string;
    sessions: number;
    users: number;
    bounce_rate: number;
  }>;
  deviceBreakdown: Array<{
    device: string;
    sessions: number;
    users: number;
    bounce_rate: number;
  }>;
}

export default function GA4Page() {
  const { user, signOut } = useAuth();
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE);
  const [insights, setInsights] = useState<GA4Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const triggerSync = useTriggerSync();

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/ga4/insights?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
      );
      const data = await response.json();
      if (data.success) {
        setInsights(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch GA4 insights:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [dateRange]);

  const summary = insights?.summary || {
    sessions: 0,
    users: 0,
    page_views: 0,
    avg_session_duration: 0,
    bounce_rate: 0,
  };
  const prevSummary = insights?.previousSummary || {
    sessions: 0,
    users: 0,
    page_views: 0,
    avg_session_duration: 0,
    bounce_rate: 0,
  };

  const chartData = useMemo(() => {
    if (!insights?.dailyAggregates) return [];
    return insights.dailyAggregates.map((day) => ({
      date: day.date,
      ga4: day.sessions,
    }));
  }, [insights?.dailyAggregates]);

  return (
    <div className="flex flex-col">
      <Header
        title="Google Analytics 4"
        description="Comprehensive GA4 analytics and insights"
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
              onClick={() => triggerSync.mutate({ platform: "ga4" })}
              disabled={triggerSync.isPending}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Sync Now
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                triggerSync.mutate({ platform: "ga4", fullSync: true })
              }
              disabled={triggerSync.isPending}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Full Sync
            </Button>
          </div>
        </div>

        {/* Main KPIs */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Sessions"
            value={formatNumber(summary.sessions || 0)}
            change={calculateChangeUtil(summary.sessions || 0, prevSummary.sessions || 0)}
            icon={TrendingUp}
            color={PLATFORM_COLORS.ga4}
            loading={loading}
          />
          <KPICard
            title="Users"
            value={formatNumber(summary.users || 0)}
            change={calculateChangeUtil(summary.users || 0, prevSummary.users || 0)}
            icon={Users}
            color={PLATFORM_COLORS.ga4}
            loading={loading}
          />
          <KPICard
            title="Page Views"
            value={formatNumber(summary.page_views || 0)}
            change={calculateChangeUtil(summary.page_views || 0, prevSummary.page_views || 0)}
            icon={Share2}
            color={PLATFORM_COLORS.ga4}
            loading={loading}
          />
          <KPICard
            title="Avg Duration (sec)"
            value={Math.round(summary.avg_session_duration || 0)}
            change={calculateChangeUtil(summary.avg_session_duration || 0, prevSummary.avg_session_duration || 0)}
            icon={TrendingUp}
            color={PLATFORM_COLORS.ga4}
            loading={loading}
          />
        </div>

        {/* Bounce Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bounce Rate</CardTitle>
            <CardDescription>
              Percentage of sessions that bounced
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {(summary.bounce_rate || 0).toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        {/* Sessions Over Time */}
        <PlatformChart
          data={chartData}
          platforms={["ga4"]}
          metric="ga4"
          title="Sessions Over Time"
          loading={loading}
        />

        {/* Traffic Sources */}
        {insights?.trafficSources && insights.trafficSources.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Share2 className="h-5 w-5" />
                Traffic Sources
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {insights.trafficSources.map((source) => (
                  <div
                    key={source.channel}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded"
                  >
                    <div>
                      <p className="font-medium">{source.channel}</p>
                      <p className="text-sm text-slate-600">
                        {formatNumber(source.sessions)} sessions • {formatNumber(source.users)} users
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {(source.bounce_rate || 0).toFixed(1)}% bounce
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Pages */}
        {insights?.topPages && insights.topPages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Top Pages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {insights.topPages.map((page, idx) => (
                  <div
                    key={page.page}
                    className="flex items-start justify-between p-3 bg-slate-50 rounded"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{idx + 1}. {page.page}</p>
                      <p className="text-sm text-slate-600">
                        {formatNumber(page.views)} views • {formatNumber(page.users)} users
                      </p>
                    </div>
                    <div className="text-right ml-2">
                      <p className="text-sm font-medium">
                        {(page.avg_duration || 0).toFixed(1)}s avg
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Geographic Distribution */}
        {insights?.geographic && insights.geographic.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Geographic Distribution (Top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {insights.geographic.slice(0, 10).map((geo) => (
                  <div
                    key={geo.country}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded"
                  >
                    <div>
                      <p className="font-medium">{geo.country}</p>
                      <p className="text-sm text-slate-600">
                        {formatNumber(geo.sessions)} sessions • {formatNumber(geo.users)} users
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {(geo.bounce_rate || 0).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Device Breakdown */}
        {insights?.deviceBreakdown && insights.deviceBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Device Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {insights.deviceBreakdown.map((device) => (
                  <div
                    key={device.device}
                    className="p-4 bg-slate-50 rounded text-center"
                  >
                    <p className="font-medium text-lg">{device.device}</p>
                    <p className="text-sm text-slate-600 mt-1">
                      {formatNumber(device.sessions)} sessions
                    </p>
                    <p className="text-sm text-slate-600">
                      {formatNumber(device.users)} users
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      {(device.bounce_rate || 0).toFixed(1)}% bounce
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

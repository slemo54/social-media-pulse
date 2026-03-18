"use client";

import { useState, useMemo, useEffect } from "react";
import { Eye, Users, Clock, RefreshCw, RotateCcw, ChevronDown, Youtube, Plus, X } from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { KPICard } from "@/components/dashboard/kpi-card";
import { PlatformChart } from "@/components/dashboard/platform-chart";
import { EpisodeTable } from "@/components/dashboard/episode-table";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useEpisodes } from "@/hooks/useEpisodes";
import { useTriggerSync } from "@/hooks/useSyncStatus";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_DATE_RANGE, PLATFORM_COLORS } from "@/lib/constants";
import { formatNumber, calculateChange } from "@/lib/utils";

interface YouTubeChannel {
  id: string;
  title: string;
  subscriberCount?: number;
  videoCount?: number;
  viewCount?: number;
  thumbnailUrl?: string;
}

const ALL_CHANNELS = "all";

export default function YouTubePage() {
  const { user, signOut } = useAuth();
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE);
  const [selectedChannelId, setSelectedChannelId] = useState(ALL_CHANNELS);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [addHandle, setAddHandle] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addResult, setAddResult] = useState<{ success?: string; error?: string } | null>(null);
  const triggerSync = useTriggerSync();

  const loadChannels = () => {
    fetch("/api/youtube/channels")
      .then((r) => r.json())
      .then((data) => setChannels(data.channels || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadChannels();
  }, []);

  const handleAddChannel = async () => {
    if (!addHandle.trim()) return;
    setAddLoading(true);
    setAddResult(null);
    try {
      const res = await fetch("/api/youtube/add-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: addHandle.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddResult({
          success: data.alreadyExists
            ? `"${data.channelTitle}" already configured`
            : `Added "${data.channelTitle}" (${data.channelId})`,
        });
        setAddHandle("");
        loadChannels();
      } else {
        setAddResult({ error: data.message });
      }
    } catch {
      setAddResult({ error: "Network error" });
    } finally {
      setAddLoading(false);
    }
  };

  // DB-based analytics for "All Channels"
  const { data: allAnalytics, isLoading: allLoading } = useAnalytics({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    platform: "youtube",
  });

  // Live per-channel analytics
  const [channelAnalytics, setChannelAnalytics] = useState<{
    aggregates: Array<{ date: string; youtube: number; watch_time: number }>;
    totals: Record<string, number>;
    previousTotals: Record<string, number>;
  } | null>(null);
  const [channelLoading, setChannelLoading] = useState(false);

  useEffect(() => {
    if (selectedChannelId === ALL_CHANNELS) {
      setChannelAnalytics(null);
      return;
    }
    setChannelLoading(true);
    fetch(
      `/api/youtube/channel-analytics?channelId=${selectedChannelId}&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.aggregates) setChannelAnalytics(data);
        else setChannelAnalytics(null);
      })
      .catch(() => setChannelAnalytics(null))
      .finally(() => setChannelLoading(false));
  }, [selectedChannelId, dateRange]);

  const analyticsLoading = selectedChannelId === ALL_CHANNELS ? allLoading : channelLoading;

  const totals =
    selectedChannelId === ALL_CHANNELS
      ? allAnalytics?.totals || {}
      : channelAnalytics?.totals || {};

  const prevTotals =
    selectedChannelId === ALL_CHANNELS
      ? allAnalytics?.previousTotals || {}
      : channelAnalytics?.previousTotals || {};

  const { episodes, isLoading: episodesLoading } = useEpisodes({});

  const chartData = useMemo(() => {
    if (selectedChannelId === ALL_CHANNELS) {
      if (!allAnalytics?.aggregates) return [];
      return (
        allAnalytics.aggregates as Array<{ date: string; total_views: number | null }>
      ).map((row) => ({ date: row.date, youtube: row.total_views || 0 }));
    }
    if (!channelAnalytics?.aggregates) return [];
    return channelAnalytics.aggregates.map((row) => ({
      date: row.date,
      youtube: row.youtube,
    }));
  }, [selectedChannelId, allAnalytics?.aggregates, channelAnalytics?.aggregates]);

  const selectedChannel =
    selectedChannelId === ALL_CHANNELS
      ? null
      : channels.find((c) => c.id === selectedChannelId);

  const channelLabel =
    selectedChannelId === ALL_CHANNELS
      ? "All Channels (Unified)"
      : selectedChannel?.title || selectedChannelId;

  return (
    <div className="flex flex-col">
      <Header
        title="YouTube"
        description="YouTube channel analytics"
        userEmail={user?.email || undefined}
        onLogout={signOut}
      />

      <div className="p-6 space-y-6">
        {/* Controls row */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onChange={setDateRange}
            />

            {/* Channel Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Youtube className="h-3.5 w-3.5 text-red-500" />
                  {channelLabel}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                <DropdownMenuLabel>Channel</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setSelectedChannelId(ALL_CHANNELS)}
                  className={selectedChannelId === ALL_CHANNELS ? "bg-accent" : ""}
                >
                  <Youtube className="mr-2 h-4 w-4 text-red-500" />
                  All Channels (Unified)
                  {channels.length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {channels.length} channels
                    </span>
                  )}
                </DropdownMenuItem>
                {channels.length > 0 && <DropdownMenuSeparator />}
                {channels.map((channel) => (
                  <DropdownMenuItem
                    key={channel.id}
                    onClick={() => setSelectedChannelId(channel.id)}
                    className={selectedChannelId === channel.id ? "bg-accent" : ""}
                  >
                    <Youtube className="mr-2 h-4 w-4 text-red-500" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{channel.title}</span>
                      {channel.subscriberCount !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {formatNumber(channel.subscriberCount)} subscribers
                        </span>
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
                {channels.length === 0 && (
                  <DropdownMenuItem disabled>
                    <span className="text-muted-foreground text-sm">No channels configured</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Add Channel button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setAddChannelOpen(true); setAddResult(null); }}
              className="flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Channel
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerSync.mutate({ platform: "youtube" })}
              disabled={triggerSync.isPending}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Sync Now
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerSync.mutate({ platform: "youtube", fullSync: true })}
              disabled={triggerSync.isPending}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Full Sync
            </Button>
          </div>
        </div>

        {/* Selected channel info card */}
        {selectedChannel && (
          <Card className="border-red-200 bg-red-50/30 dark:bg-red-950/10 dark:border-red-900">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-4 flex-wrap">
                {selectedChannel.thumbnailUrl && (
                  <img
                    src={selectedChannel.thumbnailUrl}
                    alt={selectedChannel.title}
                    className="w-12 h-12 rounded-full"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-lg truncate">{selectedChannel.title}</p>
                  <p className="text-sm text-muted-foreground">{selectedChannel.id}</p>
                </div>
                <div className="flex gap-6 text-sm">
                  {selectedChannel.subscriberCount !== undefined && (
                    <div className="text-center">
                      <p className="font-semibold">{formatNumber(selectedChannel.subscriberCount)}</p>
                      <p className="text-muted-foreground">Subscribers</p>
                    </div>
                  )}
                  {selectedChannel.videoCount !== undefined && (
                    <div className="text-center">
                      <p className="font-semibold">{formatNumber(selectedChannel.videoCount)}</p>
                      <p className="text-muted-foreground">Videos</p>
                    </div>
                  )}
                  {selectedChannel.viewCount !== undefined && (
                    <div className="text-center">
                      <p className="font-semibold">{formatNumber(selectedChannel.viewCount)}</p>
                      <p className="text-muted-foreground">Total Views</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Views"
            value={formatNumber(totals.total_views || 0)}
            change={calculateChange(totals.total_views || 0, prevTotals.total_views || 0)}
            icon={Eye}
            color={PLATFORM_COLORS.youtube}
            loading={analyticsLoading}
          />
          <KPICard
            title="Pageviews"
            value={formatNumber(totals.pageviews || 0)}
            change={calculateChange(totals.pageviews || 0, prevTotals.pageviews || 0)}
            icon={Eye}
            color={PLATFORM_COLORS.youtube}
            loading={analyticsLoading}
          />
          <KPICard
            title="Users"
            value={formatNumber(totals.users || 0)}
            change={calculateChange(totals.users || 0, prevTotals.users || 0)}
            icon={Users}
            color={PLATFORM_COLORS.youtube}
            loading={analyticsLoading}
          />
          <KPICard
            title="Watch Time (min)"
            value={formatNumber(totals.total_watch_time || 0)}
            change={calculateChange(totals.total_watch_time || 0, prevTotals.total_watch_time || 0)}
            icon={Clock}
            color={PLATFORM_COLORS.youtube}
            loading={analyticsLoading}
          />
        </div>

        {/* Chart */}
        <PlatformChart
          data={chartData}
          platforms={["youtube"]}
          metric="youtube"
          title={`YouTube Views Over Time${selectedChannel ? ` — ${selectedChannel.title}` : ""}`}
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

      {/* Add Channel Dialog */}
      <Dialog open={addChannelOpen} onOpenChange={setAddChannelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Youtube className="h-5 w-5 text-red-500" />
              Add YouTube Channel
            </DialogTitle>
            <DialogDescription>
              Enter the channel handle (e.g. @mammajumboshrimp) to add it to your dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Input
                placeholder="@channelhandle"
                value={addHandle}
                onChange={(e) => setAddHandle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddChannel()}
                disabled={addLoading}
              />
              <Button onClick={handleAddChannel} disabled={addLoading || !addHandle.trim()}>
                {addLoading ? "Searching..." : "Add"}
              </Button>
            </div>
            {addResult?.success && (
              <p className="text-sm text-green-600 flex items-center gap-1.5">
                ✓ {addResult.success}
              </p>
            )}
            {addResult?.error && (
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <X className="h-3.5 w-3.5" />
                {addResult.error}
              </p>
            )}
            {channels.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Configured channels:</p>
                <div className="space-y-1">
                  {channels.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                      <Youtube className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      <span className="font-medium truncate">{c.title}</span>
                      <span className="text-muted-foreground text-xs ml-auto shrink-0">{c.id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

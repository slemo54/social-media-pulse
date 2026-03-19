"use client";

import { useState, useMemo, useEffect } from "react";
import { Eye, Users, Clock, RefreshCw, RotateCcw, ChevronDown, Youtube, Plus, X, Link2, Lightbulb, ThumbsUp, UserPlus } from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { KPICard } from "@/components/dashboard/kpi-card";
import { PlatformChart } from "@/components/dashboard/platform-chart";
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
import { useTriggerSync } from "@/hooks/useSyncStatus";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_DATE_RANGE, PLATFORM_COLORS } from "@/lib/constants";
import { formatNumber, calculateChange, cn } from "@/lib/utils";
import type { YouTubeTopVideosResponse } from "@/app/api/youtube/top-videos/route";

interface YouTubeChannel {
  id: string;
  title: string;
  subscriberCount?: number;
  videoCount?: number;
  viewCount?: number;
  thumbnailUrl?: string;
  hasCredentials?: boolean;
}

const ALL_CHANNELS = "all";
const PODCAST_PLAYLIST_ID = "PLIgyYe8MhzC2-KSYFi_wynUDjb8CSiJ8E";

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

  // Listen for YouTube OAuth popup completion
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data === "youtube-oauth-connected") {
        loadChannels();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleConnectGoogle = () => {
    window.open(
      "/api/auth/youtube",
      "youtube-oauth",
      "width=600,height=700,popup=yes"
    );
  };

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

  // Top videos per period (Studio-style)
  const [topVideos, setTopVideos] = useState<YouTubeTopVideosResponse | null>(null);
  const [topVideosLoading, setTopVideosLoading] = useState(false);

  useEffect(() => {
    setTopVideosLoading(true);
    const params = new URLSearchParams({ startDate: dateRange.startDate, endDate: dateRange.endDate });
    if (selectedChannelId !== ALL_CHANNELS) params.set("channelId", selectedChannelId);
    params.set("playlistId", PODCAST_PLAYLIST_ID);
    fetch(`/api/youtube/top-videos?${params}`)
      .then((r) => r.json())
      .then((d: YouTubeTopVideosResponse) => setTopVideos(d))
      .catch(() => setTopVideos(null))
      .finally(() => setTopVideosLoading(false));
  }, [selectedChannelId, dateRange]);

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
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate">{channel.title}</span>
                      {channel.subscriberCount !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {formatNumber(channel.subscriberCount)} subscribers
                        </span>
                      )}
                    </div>
                    <span
                      className={`ml-2 h-2 w-2 rounded-full shrink-0 ${
                        channel.hasCredentials ? "bg-green-500" : "bg-red-500"
                      }`}
                      title={channel.hasCredentials ? "Credentials connected" : "No credentials — connect Google account"}
                    />
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

            {/* Connect Google Account button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnectGoogle}
              className="flex items-center gap-1.5"
            >
              <Link2 className="h-3.5 w-3.5" />
              Connect Google Account
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

        {/* Podcast / Video Analytics — Studio-style */}
        <Card className="border-red-900/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Youtube className="h-4 w-4 text-red-500" />
                Podcast Analytics
                <span className="text-xs font-normal text-muted-foreground">
                  — episodi RSS (playlist podcast)
                </span>
              </CardTitle>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {selectedChannelId === ALL_CHANNELS ? "Tutti i canali" : selectedChannel?.title || selectedChannelId}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {topVideosLoading ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}</div>
                <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
              </div>
            ) : !topVideos || topVideos.videos.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm text-muted-foreground">Nessun dato disponibile per il periodo selezionato.</p>
                <p className="text-xs text-muted-foreground">Assicurati che l&apos;account Google sia connesso tramite il pulsante &ldquo;Connect Google Account&rdquo; in alto.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* KPI strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: Eye,       label: "Viste Totali",   value: formatNumber(topVideos.channelSummary.totalViews),                        sub: "nel periodo" },
                    { icon: Clock,     label: "Watch Time",     value: `${topVideos.channelSummary.totalWatchTimeHours.toLocaleString("it")}h`,   sub: "ore guardate" },
                    { icon: UserPlus,  label: "Nuovi Iscritti", value: `+${topVideos.channelSummary.totalSubscribersGained}`,                    sub: "guadagnati" },
                    { icon: ThumbsUp,  label: "Like Totali",    value: formatNumber(topVideos.channelSummary.totalLikes),                        sub: "nel periodo" },
                  ].map(({ icon: Icon, label, value, sub }) => (
                    <div key={label} className="rounded-lg border border-red-900/20 bg-red-950/10 p-3 text-center">
                      <Icon className="h-4 w-4 text-red-400 mx-auto mb-1" />
                      <p className="text-xl font-bold tabular-nums">{value}</p>
                      <p className="text-xs font-medium text-red-400 mt-0.5">{label}</p>
                      <p className="text-xs text-muted-foreground">{sub}</p>
                    </div>
                  ))}
                </div>

                {/* Podcast episode table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left pb-2 pr-2 w-6">#</th>
                        <th className="text-left pb-2 min-w-[220px]">Episodio</th>
                        <th className="text-right pb-2 px-2 hidden sm:table-cell">Pubblicato</th>
                        <th className="text-right pb-2 px-2">Viste</th>
                        <th className="text-right pb-2 px-2">
                          <span title="Durata media visualizzata (MM:SS) e % del video guardato">Durata media (ret.)</span>
                        </th>
                        <th className="text-right pb-2 px-2 hidden md:table-cell">Watch (h)</th>
                        <th className="text-right pb-2 pl-2">Iscritti +</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {topVideos.videos.map((v, i) => {
                        const dur = v.avgViewDurationSeconds;
                        const mm = Math.floor(dur / 60);
                        const ss = String(Math.round(dur % 60)).padStart(2, "0");
                        const fmtDur = dur >= 60 ? `${mm}:${ss}` : `0:${ss}`;
                        const retColor = v.avgViewPercentage >= 50 ? "text-emerald-400" : v.avgViewPercentage >= 20 ? "text-amber-400" : "text-red-400";
                        const pubDate = v.publishedAt
                          ? new Date(v.publishedAt).toLocaleDateString("it", { day: "numeric", month: "short", year: "2-digit" })
                          : "—";
                        const barColor = i === 0 ? "bg-red-500" : i < 3 ? "bg-red-400" : "bg-red-300/60";
                        return (
                          <tr key={v.title} className="hover:bg-accent/20 transition-colors group">
                            <td className="py-2.5 pr-2 text-muted-foreground font-medium text-xs">{i + 1}</td>
                            <td className="py-2.5 pr-2 max-w-[300px]">
                              <p className="font-medium truncate leading-snug">{v.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 max-w-[100px] bg-muted rounded-full h-1">
                                  <div className={cn("h-1 rounded-full transition-all", barColor)} style={{ width: `${Math.min(v.viewsPercent, 100)}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground">{v.viewsPercent}% delle viste</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-right text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">{pubDate}</td>
                            <td className="py-2.5 px-2 text-right tabular-nums font-semibold">{formatNumber(v.views)}</td>
                            <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">
                              <span className="font-mono">{fmtDur}</span>
                              <span className={cn("ml-1.5 text-xs font-semibold", retColor)}>({v.avgViewPercentage}%)</span>
                            </td>
                            <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground hidden md:table-cell">{v.watchTimeHours}h</td>
                            <td className="py-2.5 pl-2 text-right tabular-nums">
                              {v.subscribersGained > 0
                                ? <span className="text-emerald-400 font-semibold">+{v.subscribersGained}</span>
                                : <span className="text-muted-foreground/40">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Insights panel */}
                {topVideos.insights.length > 0 && (
                  <div className="rounded-lg border border-red-900/20 bg-red-950/10 p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5" /> Insights sul periodo
                    </p>
                    {topVideos.insights.map((ins, i) => (
                      <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-red-400/50 mt-0.5 shrink-0">•</span>
                        <span>{ins}</span>
                      </p>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground italic">
                  Dati YouTube Analytics in tempo reale · Durata media (ret.) = MM:SS guardati (% del video)
                </p>
              </div>
            )}
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
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          c.hasCredentials ? "bg-green-500" : "bg-red-500"
                        }`}
                        title={c.hasCredentials ? "Connected" : "No credentials"}
                      />
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

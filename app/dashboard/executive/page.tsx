"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Download,
  Eye,
  Users,
  Headphones,
  Radio,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Header } from "@/components/dashboard/header";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { ExportButton } from "@/components/dashboard/export-button";
import {
  AddAnnotationDialog,
  AnnotationMarkers,
} from "@/components/dashboard/annotations";
import { useExecutiveData } from "@/hooks/useExecutiveData";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_DATE_RANGE, PLATFORM_COLORS } from "@/lib/constants";
import { formatNumber, formatDate, calculateChange, cn } from "@/lib/utils";

// 90 days default for trend
function ninetyDaysAgo() {
  return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
}
function today() {
  return new Date().toISOString().split("T")[0];
}

const METRIC_OPTIONS = [
  { value: "downloads", label: "Download" },
  { value: "views", label: "Visualizzazioni" },
  { value: "sessions", label: "Sessioni" },
  { value: "reach", label: "Portata Totale" },
] as const;

const HEATMAP_METRICS = ["downloads", "views", "sessions"] as const;

function intensity(value: number, max: number): string {
  if (max === 0) return "bg-muted";
  const ratio = value / max;
  if (ratio > 0.8) return "bg-primary/90 text-primary-foreground";
  if (ratio > 0.6) return "bg-primary/60 text-primary-foreground";
  if (ratio > 0.4) return "bg-primary/40";
  if (ratio > 0.2) return "bg-primary/20";
  return "bg-primary/5";
}

interface SparklineProps {
  data: { date: string; value: number }[];
  color?: string;
}

function Sparkline({ data, color = "#20808D" }: SparklineProps) {
  if (!data || data.length === 0) return null;
  const w = 80;
  const h = 30;
  const max = Math.max(...data.map((d) => d.value), 1);
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - (d.value / max) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
        opacity={0.8}
      />
    </svg>
  );
}

export default function ExecutivePage() {
  const { user, signOut } = useAuth();
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE);
  const [trendDateRange] = useState({ startDate: ninetyDaysAgo(), endDate: today() });
  const [metric, setMetric] = useState<string>("downloads");
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [annotationDate, setAnnotationDate] = useState<string | undefined>();

  const { data, isLoading } = useExecutiveData({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    metric,
  });

  const { annotations } = useAnnotations({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // Prepare sparkline data from sparklineData (last N days)
  const sparkDownloads = useMemo(
    () => data?.sparklineData.map((d) => ({ date: d.date, value: d.downloads })) || [],
    [data]
  );
  const sparkViews = useMemo(
    () => data?.sparklineData.map((d) => ({ date: d.date, value: d.views })) || [],
    [data]
  );
  const sparkSessions = useMemo(
    () => data?.sparklineData.map((d) => ({ date: d.date, value: d.sessions })) || [],
    [data]
  );
  const sparkListeners = useMemo(
    () => data?.sparklineData.map((d) => ({ date: d.date, value: d.listeners })) || [],
    [data]
  );
  const sparkReach = useMemo(
    () => data?.sparklineData.map((d) => ({ date: d.date, value: d.reach })) || [],
    [data]
  );

  const totals = data?.totals;
  const prevTotals = data?.prevTotals;

  // Heatmap max values
  const heatmapMaxDownloads = useMemo(
    () => Math.max(...(data?.heatmap.map((d) => d.downloads) || []), 1),
    [data]
  );
  const heatmapMaxViews = useMemo(
    () => Math.max(...(data?.heatmap.map((d) => d.views) || []), 1),
    [data]
  );
  const heatmapMaxSessions = useMemo(
    () => Math.max(...(data?.heatmap.map((d) => d.sessions) || []), 1),
    [data]
  );

  const handleChartClick = (chartData: { activeLabel?: string }) => {
    if (chartData?.activeLabel) {
      setAnnotationDate(chartData.activeLabel);
      setAnnotationOpen(true);
    }
  };

  // Badge for series performance trend
  const trendBadge = (trend: number) =>
    trend >= 0 ? (
      <span className="flex items-center gap-1 text-xs text-emerald-500">
        <TrendingUp className="h-3 w-3" />+{trend}%
      </span>
    ) : (
      <span className="flex items-center gap-1 text-xs text-red-500">
        <TrendingDown className="h-3 w-3" />{trend}%
      </span>
    );

  const kpiCards = [
    {
      title: "Portata Totale",
      value: totals?.reach || 0,
      prev: prevTotals?.reach || 0,
      sparkData: sparkReach,
      icon: Radio,
      color: "#20808D",
    },
    {
      title: "Download",
      value: totals?.downloads || 0,
      prev: prevTotals?.downloads || 0,
      sparkData: sparkDownloads,
      icon: Download,
      color: PLATFORM_COLORS.megaphone,
    },
    {
      title: "Visualizzazioni",
      value: totals?.views || 0,
      prev: prevTotals?.views || 0,
      sparkData: sparkViews,
      icon: Eye,
      color: PLATFORM_COLORS.youtube,
    },
    {
      title: "Sessioni",
      value: totals?.sessions || 0,
      prev: prevTotals?.sessions || 0,
      sparkData: sparkSessions,
      icon: Users,
      color: PLATFORM_COLORS.ga4,
    },
    {
      title: "Ascoltatori",
      value: totals?.listeners || 0,
      prev: prevTotals?.listeners || 0,
      sparkData: sparkListeners,
      icon: Headphones,
      color: PLATFORM_COLORS.soundcloud,
    },
  ];

  return (
    <div className="flex flex-col">
      <Header
        title="Report Esecutivo"
        description="Performance aggregata su tutte le piattaforme"
        userEmail={user?.email || undefined}
        onLogout={signOut}
      />

      <div className="p-6 space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={setDateRange}
          />
          <ExportButton startDate={dateRange.startDate} endDate={dateRange.endDate} />
        </div>

        {/* 1a. KPI Scorecard */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Skeleton className="h-7 w-20" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-8 w-20" />
                  </CardContent>
                </Card>
              ))
            : kpiCards.map((card) => {
                const change = calculateChange(card.value, card.prev);
                const isPositive = change >= 0;
                const Icon = card.icon;
                return (
                  <Card key={card.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {card.title}
                      </CardTitle>
                      <Icon
                        className="h-4 w-4 text-muted-foreground"
                        style={{ color: card.color }}
                      />
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="text-2xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatNumber(card.value)}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {isPositive ? (
                          <TrendingUp className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        )}
                        <span className={cn("font-medium", isPositive ? "text-emerald-500" : "text-red-500")}>
                          {isPositive ? "+" : ""}{change.toFixed(1)}%
                        </span>
                        <span>vs periodo prec.</span>
                      </p>
                      <Sparkline data={card.sparkData} color={card.color} />
                    </CardContent>
                  </Card>
                );
              })}
        </div>

        {/* 1b. Trend with Moving Average */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Trend + Media Mobile 7 Giorni</CardTitle>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRIC_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart
                  data={data?.trendData || []}
                  margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                  onClick={handleChartClick}
                  style={{ cursor: "crosshair" }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    tickFormatter={(v) => formatDate(v, "MMM d")}
                    interval={Math.floor((data?.trendData.length || 1) / 8)}
                  />
                  <YAxis
                    tickFormatter={formatNumber}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                    }}
                    formatter={(value: number) => formatNumber(value)}
                    labelFormatter={(label) => formatDate(label, "MMM d, yyyy")}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#20808D"
                    strokeWidth={1}
                    opacity={0.4}
                    dot={false}
                    name="Giornaliero"
                  />
                  <Line
                    type="monotone"
                    dataKey="ma7"
                    stroke="#20808D"
                    strokeWidth={2.5}
                    dot={false}
                    name="Media 7gg"
                  />
                  {annotations.map((ann) => (
                    <ReferenceLine
                      key={ann.id}
                      x={ann.date}
                      stroke="#6366f1"
                      strokeDasharray="4 2"
                      strokeWidth={1.5}
                      label={{
                        value: ann.note.length > 18 ? ann.note.substring(0, 18) + "…" : ann.note,
                        position: "insideTopLeft",
                        fontSize: 9,
                        fill: "#6366f1",
                      }}
                      ifOverflow="visible"
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Clicca su una data per aggiungere un'annotazione
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          {/* 1c. Top 5 Episodes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Episodi Top 5</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (data?.topEpisodes || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nessun dato episodio per questo periodo</p>
              ) : (
                <div className="space-y-2">
                  {(data?.topEpisodes || []).map((ep, i) => (
                    <div key={ep.id} className="flex items-start gap-3 p-2.5 rounded-md hover:bg-accent/50 transition-colors">
                      <span className="text-sm font-semibold text-muted-foreground w-5 shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ep.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {ep.series && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              {ep.series}
                            </Badge>
                          )}
                          {ep.pub_date && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(ep.pub_date, "MMM d, yyyy")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs shrink-0">
                        <p className="font-semibold">{formatNumber(ep.reach)}</p>
                        <p className="text-muted-foreground">portata</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 1d. Performance per Series */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performance per Serie</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (data?.seriesPerformance || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nessun dato serie</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    layout="vertical"
                    data={(data?.seriesPerformance || []).slice(0, 8)}
                    margin={{ top: 4, right: 56, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={formatNumber}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="series"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      width={90}
                      tickFormatter={(v: string) => v.length > 14 ? v.substring(0, 14) + "…" : v}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                      }}
                      formatter={(value: number, _name: string, props: { payload?: { episodeCount?: number; trend?: number } }) => [
                        `${formatNumber(value)} avg downloads · ${props.payload?.episodeCount || 0} eps`,
                      ]}
                    />
                    <Bar dataKey="avgDownloads" fill="#20808D" radius={[0, 3, 3, 0]} name="Avg Downloads">
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {/* Trend indicators */}
              {!isLoading && (data?.seriesPerformance || []).slice(0, 8).map((s) => (
                <div key={s.series} className="hidden" />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Series trend inline below chart */}
        {!isLoading && (data?.seriesPerformance || []).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trend Serie vs Periodo Precedente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(data?.seriesPerformance || []).slice(0, 8).map((s) => (
                  <div key={s.series} className="p-3 rounded-md border bg-card/50">
                    <p className="text-sm font-medium truncate">{s.series}</p>
                    <p className="text-xs text-muted-foreground">{s.episodeCount} episodi</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatNumber(s.avgDownloads)}</span>
                      {trendBadge(s.trend)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 1e. Heatmap Day of Week */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Media Performance per Giorno della Settimana</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left text-xs text-muted-foreground font-medium pr-4 pb-2 w-24">Metric</th>
                      {(data?.heatmap || []).map((d) => (
                        <th key={d.day} className="text-center text-xs text-muted-foreground font-medium pb-2 px-1 min-w-[60px]">
                          {d.day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="space-y-1">
                    {HEATMAP_METRICS.map((m) => {
                      const maxVal = m === "downloads" ? heatmapMaxDownloads : m === "views" ? heatmapMaxViews : heatmapMaxSessions;
                      const labels: Record<string, string> = { downloads: "Download", views: "Visualizzazioni", sessions: "Sessioni" };
                      return (
                        <tr key={m}>
                          <td className="text-xs text-muted-foreground capitalize pr-4 py-1">{labels[m]}</td>
                          {(data?.heatmap || []).map((d) => (
                            <td key={d.day} className="px-1 py-1">
                              <div
                                className={cn(
                                  "rounded text-center text-xs py-1.5 px-1 font-medium",
                                  intensity(d[m], maxVal)
                                )}
                              >
                                {formatNumber(d[m])}
                              </div>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Annotation dialog */}
        <AddAnnotationDialog
          open={annotationOpen}
          onOpenChange={setAnnotationOpen}
          prefillDate={annotationDate}
        />
      </div>
    </div>
  );
}

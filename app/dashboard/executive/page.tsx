"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  Users,
  Eye,
  Clock,
  TrendingDown,
  TrendingUp,
  FileText,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  Share2,
  Lightbulb,
  Youtube,
  Headphones,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/dashboard/header";
import { KPICard } from "@/components/dashboard/kpi-card";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { useExecutiveData } from "@/hooks/useExecutiveData";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_DATE_RANGE } from "@/lib/constants";
import { formatNumber, formatDate, calculateChange, cn } from "@/lib/utils";

// ── Sparkline (inline, page-specific) ──

function Sparkline({
  data,
  color = "#f59e0b",
}: {
  data: number[];
  color?: string;
}) {
  if (data.length === 0) return null;
  const w = 80;
  const h = 28;
  const max = Math.max(...data, 1);
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible mt-1">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
        opacity={0.7}
      />
    </svg>
  );
}

// ── Duration formatter ──

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Device icon helper ──

function DeviceIcon({ device }: { device: string }) {
  const d = device.toLowerCase();
  if (d.includes("mobile")) return <Smartphone className="h-5 w-5" />;
  if (d.includes("tablet")) return <Tablet className="h-5 w-5" />;
  return <Monitor className="h-5 w-5" />;
}

// ── Progress bar ──

function ProgressBar({ pct, color = "bg-amber-500" }: { pct: number; color?: string }) {
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div className={cn("h-2 rounded-full", color)} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Page
// ══════════════════════════════════════════════════════════

export default function ExecutivePage() {
  const { user, signOut } = useAuth();
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE);
  const { data, isLoading, error } = useExecutiveData({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const kpis = data?.siteKPIs;
  const trend = data?.siteTrend;
  const impact = data?.editorialImpact;

  // Sparkline: last 7 daily values
  const spark = useMemo(() => {
    if (!trend?.daily) return { sessions: [], users: [] };
    const last7 = trend.daily.slice(-7);
    return {
      sessions: last7.map((d) => d.sessions),
      users: last7.map((d) => d.users),
    };
  }, [trend?.daily]);

  // Chart data
  const chartData = useMemo(() => trend?.daily || [], [trend?.daily]);

  // Period label
  const prevLabel = data?.period
    ? `${formatDate(data.period.prevStart, "d MMM")} — ${formatDate(data.period.prevEnd, "d MMM yyyy")}`
    : "";

  const GA4_COLOR = "#f59e0b";

  return (
    <div className="flex flex-col">
      {/* ── Section 1: Header ── */}
      <Header
        title="Executive Summary"
        description="Andamento del sito e impatto dei contenuti"
        userEmail={user?.email || undefined}
        onLogout={signOut}
      />

      <div className="p-6 space-y-8">
        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onChange={setDateRange}
            />
            {data?.lastSyncAt && (
              <Badge variant="outline" className="text-xs">
                Ultimo sync: {formatDate(data.lastSyncAt, "d MMM HH:mm")}
              </Badge>
            )}
          </div>
          {prevLabel && (
            <p className="text-xs text-muted-foreground">
              Confronto con: {prevLabel}
            </p>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <Card className="border-red-300 bg-red-50 dark:bg-red-950/20">
            <CardContent className="py-3 text-sm text-red-600">
              Dati GA4 non disponibili: {(error as Error).message}
            </CardContent>
          </Card>
        )}

        {/* ── Section 2: Site KPIs ── */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <KPICard
            title="Sessions"
            value={formatNumber(kpis?.sessions || 0)}
            change={calculateChange(kpis?.sessions || 0, kpis?.prevSessions || 0)}
            icon={Activity}
            color={GA4_COLOR}
            loading={isLoading}
          />
          <KPICard
            title="Users"
            value={formatNumber(kpis?.users || 0)}
            change={calculateChange(kpis?.users || 0, kpis?.prevUsers || 0)}
            icon={Users}
            color={GA4_COLOR}
            loading={isLoading}
          />
          <KPICard
            title="Page Views"
            value={formatNumber(kpis?.pageViews || 0)}
            change={calculateChange(kpis?.pageViews || 0, kpis?.prevPageViews || 0)}
            icon={Eye}
            color={GA4_COLOR}
            loading={isLoading}
          />
          <KPICard
            title="Durata Media"
            value={fmtDuration(kpis?.avgSessionDuration || 0)}
            change={calculateChange(
              kpis?.avgSessionDuration || 0,
              kpis?.prevAvgSessionDuration || 0
            )}
            icon={Clock}
            color={GA4_COLOR}
            loading={isLoading}
          />
          <KPICard
            title="Bounce Rate"
            value={`${(kpis?.bounceRate || 0).toFixed(1)}%`}
            change={calculateChange(kpis?.bounceRate || 0, kpis?.prevBounceRate || 0)}
            icon={TrendingDown}
            color={GA4_COLOR}
            loading={isLoading}
            invertChange
          />
          {/* Content published — custom card */}
          {isLoading ? (
            <Card>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-20" /></CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <span className="text-sm font-medium text-muted-foreground">Contenuti</span>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {kpis?.contentPublished.total || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis?.contentPublished.videos || 0} video + {kpis?.contentPublished.podcasts || 0} podcast
                </p>
                {kpis?.contentPublished.prevTotal !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    {kpis.contentPublished.prevTotal} nel periodo prec.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Section 3: Site Trend ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Andamento del Traffico</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      tickFormatter={(v) => formatDate(v, "d MMM")}
                      interval={Math.max(Math.floor((chartData.length || 1) / 10), 1)}
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
                      formatter={(value: number, name: string) => [
                        formatNumber(value),
                        name,
                      ]}
                      labelFormatter={(label) => formatDate(label, "d MMM yyyy")}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="sessions"
                      fill={GA4_COLOR}
                      fillOpacity={0.1}
                      stroke={GA4_COLOR}
                      strokeWidth={2}
                      name="Sessions"
                    />
                    <Line
                      type="monotone"
                      dataKey="users"
                      stroke="#6366f1"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      opacity={0.5}
                      name="Users"
                    />
                    {/* Content markers */}
                    {(trend?.contentMarkers || []).map((marker, i) => (
                      <ReferenceLine
                        key={`${marker.date}-${i}`}
                        x={marker.date}
                        stroke={marker.type === "video" ? "#ef4444" : "#f97316"}
                        strokeDasharray="4 2"
                        strokeWidth={1}
                        label={{
                          value: marker.type === "video" ? "▶" : "🎙",
                          position: "top",
                          fontSize: 10,
                        }}
                        ifOverflow="visible"
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>

                {/* Legend for markers */}
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-red-500 inline-block" /> Video YouTube
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-orange-500 inline-block" /> Episodio Podcast
                  </span>
                </div>

                {/* Summary strip */}
                {trend?.summary && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t">
                    <div className="text-center">
                      <p className="text-lg font-semibold">{formatNumber(trend.summary.avgDailySessions)}</p>
                      <p className="text-xs text-muted-foreground">media sessions/giorno</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">
                        {trend.summary.bestDay.date
                          ? formatDate(trend.summary.bestDay.date, "d MMM")
                          : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        giorno migliore ({formatNumber(trend.summary.bestDay.sessions)} sessions)
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">
                        {trend.summary.publicationLift > 0 ? "+" : ""}
                        {trend.summary.publicationLift.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        giorni con pubblicazione vs senza
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Section 4: Traffic Origins ── */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
          {/* Traffic Sources */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Share2 className="h-4 w-4" /> Sorgenti di Traffico
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
              ) : (
                <div className="space-y-3">
                  {(data?.trafficSources || []).map((s) => (
                    <div key={s.channel}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium truncate">{s.channel}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">
                          {formatNumber(s.sessions)} ({s.percentage}%)
                        </span>
                      </div>
                      <ProgressBar pct={s.percentage} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Countries */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4" /> Top Paesi
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
              ) : (
                <div className="space-y-3">
                  {(data?.topCountries || []).map((c) => (
                    <div key={c.country}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{c.country}</span>
                        <span className="text-muted-foreground">
                          {formatNumber(c.sessions)} ({c.percentage}%)
                        </span>
                      </div>
                      <ProgressBar pct={c.percentage} color="bg-indigo-500" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Device Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Dispositivi
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-32" />
              ) : (
                <div className="space-y-4">
                  {(data?.deviceBreakdown || []).map((d) => (
                    <div key={d.device} className="flex items-center gap-3">
                      <DeviceIcon device={d.device} />
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium capitalize">{d.device}</span>
                          <span className="text-muted-foreground">
                            {formatNumber(d.sessions)} ({d.percentage}%)
                          </span>
                        </div>
                        <ProgressBar pct={d.percentage} color="bg-teal-500" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Section 5a: YouTube Analytics (full-width Studio-style) ── */}
        <Card className="border-red-900/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Youtube className="h-4 w-4 text-red-500" />
                <span>YouTube Analytics</span>
              </CardTitle>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {dateRange.startDate} — {dateRange.endDate}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
                <Skeleton className="h-48 w-full" />
              </div>
            ) : (data?.topYouTubeContent || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nessun dato video disponibile per il periodo selezionato.</p>
            ) : (
              <div className="space-y-5">
                {/* Channel KPI strip */}
                {data?.youtubeChannelSummary && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Viste Totali", value: formatNumber(data.youtubeChannelSummary.totalViews), sub: "nel periodo" },
                      { label: "Watch Time", value: `${data.youtubeChannelSummary.totalWatchTimeHours.toLocaleString("it")}h`, sub: "ore guardate" },
                      { label: "Nuovi Iscritti", value: `+${data.youtubeChannelSummary.totalSubscribersGained}`, sub: "guadagnati" },
                      { label: "Like Totali", value: formatNumber(data.youtubeChannelSummary.totalLikes), sub: "nel periodo" },
                    ].map((kpi) => (
                      <div key={kpi.label} className="rounded-lg border border-red-900/20 bg-red-950/10 p-3 text-center">
                        <p className="text-xl font-bold tabular-nums">{kpi.value}</p>
                        <p className="text-xs font-medium text-red-400 mt-0.5">{kpi.label}</p>
                        <p className="text-xs text-muted-foreground">{kpi.sub}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Video table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left pb-2 pr-3 w-6">#</th>
                        <th className="text-left pb-2 min-w-[200px]">Contenuto</th>
                        <th className="text-right pb-2 px-3">Viste</th>
                        <th className="text-right pb-2 px-3">Watch (h)</th>
                        <th className="text-right pb-2 px-3">Retention</th>
                        <th className="text-right pb-2 px-3">Durata media</th>
                        <th className="text-right pb-2 pl-3">Iscritti +</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {(data?.topYouTubeContent || []).map((v, i) => {
                        const barColor = i === 0 ? "bg-red-500" : i === 1 ? "bg-red-400" : "bg-red-300/70";
                        return (
                          <tr key={v.title} className="hover:bg-accent/30 transition-colors group">
                            <td className="py-2.5 pr-3 text-muted-foreground font-medium w-6">{i + 1}</td>
                            <td className="py-2.5 pr-3 max-w-[280px]">
                              <p className="font-medium truncate text-sm">{v.title}</p>
                              {/* View share bar */}
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 max-w-[120px] bg-muted rounded-full h-1.5">
                                  <div className={cn("h-1.5 rounded-full", barColor)} style={{ width: `${Math.min(v.viewsPercent, 100)}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0">{v.viewsPercent}%</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums font-medium">{formatNumber(v.views)}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{v.watchTimeHours.toLocaleString("it")}h</td>
                            <td className="py-2.5 px-3 text-right">
                              <span className={cn(
                                "text-xs font-semibold px-1.5 py-0.5 rounded",
                                v.avgViewPercentage >= 50 ? "bg-emerald-500/10 text-emerald-400" :
                                v.avgViewPercentage >= 30 ? "bg-amber-500/10 text-amber-400" :
                                "bg-red-500/10 text-red-400"
                              )}>
                                {v.avgViewPercentage}%
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                              {fmtDuration(v.avgViewDurationSeconds)}
                            </td>
                            <td className="py-2.5 pl-3 text-right tabular-nums">
                              {v.subscribersGained > 0
                                ? <span className="text-emerald-400 font-medium">+{v.subscribersGained}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* YouTube insights */}
                {(data?.youtubeInsights || []).length > 0 && (
                  <div className="rounded-lg border border-red-900/20 bg-red-950/10 p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5" /> Insights YouTube
                    </p>
                    {(data?.youtubeInsights || []).map((ins, i) => (
                      <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-red-400/60 mt-0.5 shrink-0">•</span>
                        <span>{ins}</span>
                      </p>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground italic">
                  Dati YouTube Analytics in tempo reale · Retention = % media del video guardato
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Section 5b: Top Pages + Audio (2-col) ── */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {/* Top Pages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" /> Top Pagine del Sito
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : (data?.topPages || []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nessun dato disponibile</p>
              ) : (
                <div className="space-y-1">
                  {(data?.topPages || []).map((p, i) => (
                    <div key={p.page} className="flex items-start gap-2 p-2 rounded hover:bg-accent/50 text-sm">
                      <span className="text-muted-foreground w-5 shrink-0 font-medium">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.page}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(p.views)} views · {formatNumber(p.users)} users · {p.avgDuration.toFixed(0)}s avg
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Audio Content */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Headphones className="h-4 w-4 text-orange-500" /> Top Contenuti Audio
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : (data?.topAudioContent || []).length === 0 ? (
                <div className="py-4 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">SoundCloud non connesso.</p>
                  <p className="text-xs text-muted-foreground">Il token è scaduto — vai su Impostazioni → SoundCloud per riconnettersi.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    {(data?.topAudioContent || []).map((a, i) => (
                      <div key={a.title} className="flex items-start gap-2 p-2 rounded hover:bg-accent/50 text-sm">
                        <span className="text-muted-foreground w-5 shrink-0 font-medium">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{a.title}</p>
                          <p className="text-xs text-muted-foreground">{formatNumber(a.plays)} plays (lifetime)</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 italic">Plays lifetime da SoundCloud</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Section 6: Editorial Impact ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Impatto Editoriale sul Sito</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !impact || impact.totalPublished === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Nessun contenuto pubblicato nel periodo selezionato.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg border bg-card/50 text-center">
                    <p className="text-2xl font-bold">{impact.totalPublished}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      contenuti ({impact.videos} video, {impact.podcasts} podcast)
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border bg-card/50 text-center">
                    <p className="text-2xl font-bold">
                      {impact.publicationLiftPercent > 0 ? "+" : ""}
                      {impact.publicationLiftPercent.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      sessions giorni con pubblicazione vs senza
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border bg-card/50 text-center">
                    <p className="text-2xl font-bold">
                      {impact.avg48hEffect > 0 ? "+" : ""}
                      {impact.avg48hEffect.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      effetto medio 48h dopo pubblicazione
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border bg-card/50 text-center">
                    {impact.bestContent ? (
                      <>
                        <p className="text-sm font-semibold truncate">{impact.bestContent.title}</p>
                        <p className="text-lg font-bold text-emerald-500 mt-1">
                          +{impact.bestContent.sessionsDelta} sessions
                        </p>
                        <p className="text-xs text-muted-foreground">miglior impatto</p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">
                        Nessun impatto rilevante osservato
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3 italic">
                  Nota: correlazioni osservate, non rapporti di causalità. Altri fattori possono influenzare il traffico.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Section 7: Management Insights ── */}
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" /> Insight per il Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5" />)}</div>
            ) : (
              <>
                <ul className="space-y-2">
                  {(data?.insights || []).map((insight, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-muted-foreground mt-0.5">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
                {data?.recommendation && (
                  <div className="mt-4 p-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                    <p className="text-sm font-medium">
                      <strong>Raccomandazione:</strong> {data.recommendation}
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Footer: Data Notes ── */}
        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs font-medium flex items-center gap-1 text-muted-foreground mb-2">
            <Info className="h-3 w-3" /> Note sui dati
          </p>
          <p className="text-xs text-muted-foreground">
            • Dati del sito (sessions, users, page views): Google Analytics 4, tempo reale
          </p>
          <p className="text-xs text-muted-foreground">
            • Dati YouTube: aggiornati all&apos;ultimo sync — views, likes e watch time reali
          </p>
          <p className="text-xs text-muted-foreground">
            • Dati SoundCloud: totale plays lifetime per episodio, non andamento giornaliero
          </p>
          <p className="text-xs text-muted-foreground">
            • Dati Megaphone: solo contenuti pubblicati, non metriche di download reali
          </p>
          <p className="text-xs text-muted-foreground">
            • Correlazione pubblicazioni-traffico: osservazione temporale, non causalità dimostrata
          </p>
        </div>
      </div>
    </div>
  );
}

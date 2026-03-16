"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CHART_COLORS } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";

interface EpisodeLifecycleData {
  episodeId: string;
  title: string;
  pubDate: string;
  /** day index (0 = pub date) → cumulative metric value */
  curve: { day: number; value: number }[];
}

interface EpisodeLifecycleProps {
  episodes: EpisodeLifecycleData[];
  loading?: boolean;
  metric?: "downloads" | "views";
}

/**
 * Overlay multiple episode lifecycle curves.
 * X axis: days since publication (0–30)
 * Y axis: cumulative downloads/views
 */
export function EpisodeLifecycle({
  episodes,
  loading = false,
  metric = "downloads",
}: EpisodeLifecycleProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!episodes || episodes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Episode Lifecycle</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No lifecycle data available
          </p>
        </CardContent>
      </Card>
    );
  }

  // Build combined chart data: 31 rows (day 0–30), each episode is a key
  const MAX_DAYS = 30;
  const combined: Record<string, number | string>[] = Array.from({ length: MAX_DAYS + 1 }, (_, i) => ({
    day: i,
  }));

  for (const ep of episodes) {
    const curveMap = new Map(ep.curve.map((p) => [p.day, p.value]));
    for (let d = 0; d <= MAX_DAYS; d++) {
      if (curveMap.has(d)) {
        combined[d][ep.episodeId] = curveMap.get(d)!;
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Episode Lifecycle — Cumulative {metric === "downloads" ? "Downloads" : "Views"} (first 30 days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={combined} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11 }}
              tickLine={false}
              label={{ value: "Days since publication", position: "insideBottom", offset: -2, fontSize: 11 }}
              height={36}
            />
            <YAxis
              tickFormatter={formatNumber}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                const ep = episodes.find((e) => e.episodeId === name);
                return [formatNumber(value), ep?.title || name];
              }}
              labelFormatter={(label) => `Day ${label}`}
              contentStyle={{
                fontSize: 12,
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
              }}
            />
            <Legend
              formatter={(value) => {
                const ep = episodes.find((e) => e.episodeId === value);
                const title = ep?.title || value;
                return title.length > 30 ? title.substring(0, 30) + "…" : title;
              }}
              wrapperStyle={{ fontSize: 11 }}
            />
            {episodes.map((ep, idx) => (
              <Line
                key={ep.episodeId}
                type="monotone"
                dataKey={ep.episodeId}
                stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

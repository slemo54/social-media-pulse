"use client";

import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PLATFORM_COLORS, PLATFORM_NAMES } from "@/lib/constants";
import { formatDate, formatNumber } from "@/lib/utils";

interface PlatformChartProps {
  data: Record<string, unknown>[];
  platforms: string[];
  metric: string;
  type?: "line" | "bar";
  loading?: boolean;
  title?: string;
}

export function PlatformChart({
  data,
  platforms,
  metric,
  type = "line",
  loading = false,
  title,
}: PlatformChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const ChartComponent = type === "bar" ? BarChart : LineChart;

  return (
    <Card>
      {title && (
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ChartComponent data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatDate(value, "MMM d")}
              className="text-xs"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              tickFormatter={(value: number) => formatNumber(value)}
              className="text-xs"
              tick={{ fontSize: 12 }}
              width={60}
            />
            <Tooltip
              labelFormatter={(value: string) => formatDate(value)}
              formatter={(value: number, name: string) => [
                formatNumber(value),
                PLATFORM_NAMES[name] || name,
              ]}
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                fontSize: "12px",
              }}
            />
            <Legend
              formatter={(value: string) => PLATFORM_NAMES[value] || value}
            />
            {platforms.map((platform) =>
              type === "bar" ? (
                <Bar
                  key={platform}
                  dataKey={platform}
                  name={platform}
                  fill={PLATFORM_COLORS[platform] || "#8884d8"}
                  radius={[2, 2, 0, 0]}
                />
              ) : (
                <Line
                  key={platform}
                  type="monotone"
                  dataKey={platform}
                  name={platform}
                  stroke={PLATFORM_COLORS[platform] || "#8884d8"}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )
            )}
          </ChartComponent>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

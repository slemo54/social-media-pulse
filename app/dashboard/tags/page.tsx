"use client";

import { useState, useMemo } from "react";
import { Tag, TrendingUp, TrendingDown } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
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
import { useTagAnalytics } from "@/hooks/useTagAnalytics";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_DATE_RANGE } from "@/lib/constants";
import { formatNumber, cn } from "@/lib/utils";

export default function TagsPage() {
  const { user, signOut } = useAuth();
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data, isLoading } = useTagAnalytics({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const categories = data?.categories || [];

  const filteredTags = useMemo(() => {
    const tags = data?.allTags || [];
    if (categoryFilter === "all") return tags.slice(0, 20);
    return tags.filter((t) => t.category === categoryFilter).slice(0, 20);
  }, [data, categoryFilter]);

  const chartData = filteredTags.slice(0, 20).map((t) => ({
    ...t,
    displayLabel: t.label.length > 18 ? t.label.substring(0, 18) + "…" : t.label,
  }));

  return (
    <div className="flex flex-col">
      <Header
        title="Tag Analytics"
        description="Performance breakdown by episode tags"
        userEmail={user?.email || undefined}
        onLogout={signOut}
      />

      <div className="p-6 space-y-6">
        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={setDateRange}
          />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat} className="capitalize">
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Tags by Avg Downloads</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : filteredTags.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Tag className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No tag data found. Add tags to your episodes to see analytics here.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(300, filteredTags.length * 32)}>
                <BarChart
                  layout="vertical"
                  data={chartData}
                  margin={{ top: 4, right: 60, left: 0, bottom: 4 }}
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
                    dataKey="displayLabel"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                    }}
                    formatter={(value: number, _name: string, props: { payload?: { tag?: string; episodeCount?: number; avgViews?: number; trend?: number } }) => [
                      `${formatNumber(value)} avg downloads · ${props.payload?.episodeCount || 0} episodes`,
                      props.payload?.tag || "",
                    ]}
                  />
                  <Bar dataKey="avgDownloads" fill="#20808D" radius={[0, 3, 3, 0]} name="Avg Downloads" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Tag table */}
        {!isLoading && filteredTags.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tag Performance Table</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left font-medium text-muted-foreground pb-2 pr-4">Tag</th>
                      <th className="text-left font-medium text-muted-foreground pb-2 pr-4">Category</th>
                      <th className="text-right font-medium text-muted-foreground pb-2 pr-4">Episodes</th>
                      <th className="text-right font-medium text-muted-foreground pb-2 pr-4">Avg Downloads</th>
                      <th className="text-right font-medium text-muted-foreground pb-2 pr-4">Avg Views</th>
                      <th className="text-right font-medium text-muted-foreground pb-2">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTags.map((t) => (
                      <tr key={t.tag} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                        <td className="py-2 pr-4 font-medium">{t.label}</td>
                        <td className="py-2 pr-4">
                          {t.category ? (
                            <Badge variant="outline" className="text-xs capitalize">
                              {t.category}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {t.episodeCount}
                        </td>
                        <td className="py-2 pr-4 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatNumber(t.avgDownloads)}
                        </td>
                        <td className="py-2 pr-4 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatNumber(t.avgViews)}
                        </td>
                        <td className="py-2 text-right">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-xs font-medium",
                              t.trend >= 0 ? "text-emerald-500" : "text-red-500"
                            )}
                          >
                            {t.trend >= 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {t.trend >= 0 ? "+" : ""}{t.trend}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

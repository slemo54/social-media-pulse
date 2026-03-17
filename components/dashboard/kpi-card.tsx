"use client";

import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricTooltip } from "@/components/dashboard/MetricTooltip";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  change: number;
  icon: LucideIcon;
  loading?: boolean;
  color?: string;
  tooltip?: string;
}

export function KPICard({
  title,
  value,
  change,
  icon: Icon,
  loading = false,
  color,
  tooltip,
}: KPICardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-20 mb-1" />
          <Skeleton className="h-3 w-16" />
        </CardContent>
      </Card>
    );
  }

  const isPositive = change >= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          {title}
          {tooltip && <MetricTooltip content={tooltip} />}
        </CardTitle>
        <Icon
          className="h-4 w-4 text-muted-foreground"
          style={color ? { color } : undefined}
        />
      </CardHeader>
      <CardContent>
        <div
          className="text-2xl font-bold"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
          {isPositive ? (
            <TrendingUp className="h-3 w-3 text-emerald-500" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-500" />
          )}
          <span
            className={cn(
              "font-medium",
              isPositive ? "text-emerald-500" : "text-red-500"
            )}
          >
            {isPositive ? "+" : ""}
            {change.toFixed(1)}%
          </span>
          <span>from previous period</span>
        </p>
      </CardContent>
    </Card>
  );
}

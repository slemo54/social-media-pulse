"use client";

import { formatDistanceToNow, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SyncStatusBadgeProps {
  status: "success" | "error" | "syncing" | "never" | string;
  lastSync: string | null;
}

export function SyncStatusBadge({ status, lastSync }: SyncStatusBadgeProps) {
  const relativeTime = lastSync
    ? formatDistanceToNow(parseISO(lastSync), { addSuffix: true })
    : null;

  const statusConfig: Record<
    string,
    { label: string; className: string }
  > = {
    success: {
      label: "Synced",
      className:
        "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800",
    },
    error: {
      label: "Error",
      className:
        "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800",
    },
    syncing: {
      label: "Syncing",
      className:
        "bg-yellow-100 text-yellow-700 border-yellow-200 animate-pulse dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800",
    },
    never: {
      label: "Never synced",
      className:
        "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
    },
  };

  const config = statusConfig[status] || statusConfig.never;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={cn("text-xs", config.className)}>
        {config.label}
      </Badge>
      {relativeTime && (
        <span className="text-xs text-muted-foreground">{relativeTime}</span>
      )}
    </div>
  );
}

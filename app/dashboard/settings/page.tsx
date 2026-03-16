"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  RotateCcw,
  Rss,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { SyncStatusBadge } from "@/components/dashboard/sync-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useSyncStatus, useTriggerSync } from "@/hooks/useSyncStatus";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { PLATFORM_NAMES, PLATFORM_COLORS } from "@/lib/constants";
import { formatDate, formatNumber } from "@/lib/utils";

interface SyncLogRow {
  id: string;
  platform: string;
  sync_type: string;
  status: string;
  records_count: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { data: dataSources, isLoading: sourcesLoading } = useSyncStatus();
  const triggerSync = useTriggerSync();
  const [rssUrl, setRssUrl] = useState(
    process.env.NEXT_PUBLIC_RSS_FEED_URL || ""
  );

  // Fetch sync logs
  const { data: syncLogs, isLoading: logsLoading } = useQuery<SyncLogRow[]>({
    queryKey: ["sync-logs"],
    queryFn: async () => {
      const res = await fetch("/api/data-sources");
      if (!res.ok) return [];
      // sync_logs would come from a separate endpoint in production
      // For now, we return empty array
      return [];
    },
  });

  const handleSync = (platform: string, fullSync: boolean) => {
    triggerSync.mutate(
      { platform, fullSync },
      {
        onSuccess: () => {
          toast({
            title: "Sync complete",
            description: `${PLATFORM_NAMES[platform] || platform} synced successfully.`,
          });
        },
        onError: (err: Error) => {
          toast({
            title: "Sync failed",
            description: err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleImportAll = async () => {
    if (!rssUrl) return;
    try {
      const res = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: rssUrl }),
      });
      if (!res.ok) throw new Error("Import failed");
      const data = (await res.json()) as { imported: number };
      toast({
        title: "Import complete",
        description: `${data.imported} episodes imported.`,
      });
    } catch (err) {
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleTestParse = async () => {
    if (!rssUrl) return;
    try {
      const res = await fetch(rssUrl);
      if (!res.ok) throw new Error("Could not fetch feed");
      const text = await res.text();
      const itemCount = (text.match(/<item>/gi) || []).length;
      toast({
        title: "Feed parsed",
        description: `Found ${itemCount} items in the RSS feed.`,
      });
    } catch (err) {
      toast({
        title: "Parse failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col">
      <Header
        title="Settings"
        description="Manage data sources and sync"
        userEmail={user?.email || undefined}
        onLogout={signOut}
      />

      <div className="p-6 space-y-6">
        {/* Data Sources */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {sourcesLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                {(dataSources || []).map((ds) => (
                  <Card key={ds.id} className="border">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{
                              backgroundColor:
                                PLATFORM_COLORS[ds.platform] || "#888",
                            }}
                          />
                          <span className="font-medium">
                            {PLATFORM_NAMES[ds.platform] || ds.platform}
                          </span>
                        </div>
                        {ds.api_key_configured ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <SyncStatusBadge
                          status={ds.last_sync_status || "never"}
                          lastSync={ds.last_sync_at}
                        />
                        {ds.last_sync_error && (
                          <p className="text-xs text-destructive">
                            {ds.last_sync_error}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Records: {formatNumber(ds.records_synced)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(ds.platform, false)}
                          disabled={triggerSync.isPending}
                        >
                          <RefreshCw className="mr-1.5 h-3 w-3" />
                          Sync
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(ds.platform, true)}
                          disabled={triggerSync.isPending}
                        >
                          <RotateCcw className="mr-1.5 h-3 w-3" />
                          Full Sync
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* RSS Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">RSS Feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Rss className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="https://feeds.example.com/podcast.xml"
                value={rssUrl}
                onChange={(e) => setRssUrl(e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestParse}
                disabled={!rssUrl}
              >
                Test Parse
              </Button>
              <Button size="sm" onClick={handleImportAll} disabled={!rssUrl}>
                Import All Episodes
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sync Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sync Logs</CardTitle>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (syncLogs || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No sync logs yet. Sync a platform to see activity.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(syncLogs || []).slice(0, 20).map((log) => {
                    const duration =
                      log.completed_at && log.started_at
                        ? Math.round(
                            (new Date(log.completed_at).getTime() -
                              new Date(log.started_at).getTime()) /
                              1000
                          )
                        : null;
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">
                          {PLATFORM_NAMES[log.platform] || log.platform}
                        </TableCell>
                        <TableCell>{log.sync_type}</TableCell>
                        <TableCell>
                          <SyncStatusBadge
                            status={log.status}
                            lastSync={null}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(log.records_count)}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-destructive">
                          {log.error_message || "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(log.started_at, "MMM d, HH:mm")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {duration != null ? `${duration}s` : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

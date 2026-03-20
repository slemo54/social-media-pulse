"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Radio,
  Apple,
  Play,
  Loader2,
  LogIn,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, parseISO } from "date-fns";
import { PLATFORM_NAMES, PLATFORM_COLORS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SyncJob {
  id: string;
  platform: string;
  status: string;
  log: Array<{ ts: string; message: string }>;
  error_message: string | null;
  raw_data: unknown;
  records_synced: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface DataSource {
  platform: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

const AUDIO_PLATFORMS = ["megaphone", "apple_podcasts"] as const;

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; className: string }
> = {
  pending: {
    label: "Waiting for runner...",
    icon: Clock,
    className: "text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-950 dark:border-yellow-800",
  },
  running: {
    label: "Running...",
    icon: Loader2,
    className: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800",
  },
  waiting_for_login: {
    label: "Waiting for login",
    icon: LogIn,
    className: "text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950 dark:border-orange-800",
  },
  importing: {
    label: "Importing data...",
    icon: Loader2,
    className: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950 dark:border-emerald-800",
  },
  error: {
    label: "Error",
    icon: XCircle,
    className: "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AudioSyncPanel() {
  const queryClient = useQueryClient();
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Fetch sync jobs — poll every 3s when there's an active job
  const { data: jobs } = useQuery<SyncJob[]>({
    queryKey: ["sync-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/sync-jobs?limit=20");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data as SyncJob[] | undefined;
      const hasActive = data?.some((j) =>
        ["pending", "running", "waiting_for_login", "importing"].includes(j.status)
      );
      return hasActive ? 3000 : 30000;
    },
  });

  // Fetch data sources for last sync info
  const { data: dataSources } = useQuery<DataSource[]>({
    queryKey: ["data-sources"],
    queryFn: async () => {
      const res = await fetch("/api/data-sources");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Create sync job mutation
  const createJob = useMutation({
    mutationFn: async (platform: string) => {
      const res = await fetch("/api/sync-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Failed to create job");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-jobs"] });
    },
  });

  // Reset stale job mutation
  const resetJob = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch("/api/sync-jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action: "reset" }),
      });
      if (!res.ok) throw new Error("Failed to reset job");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    },
  });

  // Helpers
  const getActiveJob = useCallback(
    (platform: string) =>
      jobs?.find(
        (j) =>
          j.platform === platform &&
          ["pending", "running", "waiting_for_login", "importing"].includes(j.status)
      ),
    [jobs]
  );

  const getLastCompletedJob = useCallback(
    (platform: string) =>
      jobs?.find(
        (j) =>
          j.platform === platform &&
          ["completed", "error"].includes(j.status)
      ),
    [jobs]
  );

  const getDataSource = useCallback(
    (platform: string) =>
      dataSources?.find((ds) => ds.platform === platform),
    [dataSources]
  );

  const isStale = (job: SyncJob) => {
    if (!["running", "waiting_for_login", "importing"].includes(job.status)) return false;
    const started = job.started_at ? new Date(job.started_at).getTime() : new Date(job.created_at).getTime();
    return Date.now() - started > 15 * 60 * 1000; // 15 minutes
  };

  const handleSyncAll = () => {
    for (const platform of AUDIO_PLATFORMS) {
      if (!getActiveJob(platform)) {
        createJob.mutate(platform);
      }
    }
  };

  const platformIcon = (platform: string) => {
    switch (platform) {
      case "megaphone":
        return Radio;
      case "apple_podcasts":
        return Apple;
      default:
        return Radio;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Audio Analytics Sync</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncAll}
          disabled={
            createJob.isPending ||
            AUDIO_PLATFORMS.every((p) => !!getActiveJob(p))
          }
        >
          <Play className="mr-1.5 h-3 w-3" />
          Sync All Audio
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Platform cards */}
        {AUDIO_PLATFORMS.map((platform) => {
          const Icon = platformIcon(platform);
          const activeJob = getActiveJob(platform);
          const lastJob = getLastCompletedJob(platform);
          const ds = getDataSource(platform);
          const hasActiveJob = !!activeJob;

          return (
            <div
              key={platform}
              className="border rounded-lg p-4 space-y-3"
              style={{ borderLeftColor: PLATFORM_COLORS[platform], borderLeftWidth: 3 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    {PLATFORM_NAMES[platform] || platform}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => createJob.mutate(platform)}
                  disabled={createJob.isPending || hasActiveJob}
                >
                  {hasActiveJob ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="mr-1.5 h-3 w-3" />
                  )}
                  {hasActiveJob ? "In progress" : "Sync"}
                </Button>
              </div>

              {/* Last sync info */}
              <div className="text-xs text-muted-foreground">
                {ds?.last_sync_at ? (
                  <span>
                    Last sync:{" "}
                    {formatDistanceToNow(parseISO(ds.last_sync_at), {
                      addSuffix: true,
                    })}
                    {ds.last_sync_status === "error" && ds.last_sync_error && (
                      <span className="text-red-500 ml-2">
                        ({ds.last_sync_error.substring(0, 60)})
                      </span>
                    )}
                  </span>
                ) : (
                  <span>Never synced</span>
                )}
              </div>

              {/* Active job status */}
              {activeJob && (
                <ActiveJobDisplay
                  job={activeJob}
                  isStale={isStale(activeJob)}
                  onReset={() => resetJob.mutate(activeJob.id)}
                  expanded={expandedLog === activeJob.id}
                  onToggleExpand={() =>
                    setExpandedLog(
                      expandedLog === activeJob.id ? null : activeJob.id
                    )
                  }
                />
              )}

              {/* Last completed job (if no active) */}
              {!activeJob && lastJob && (
                <LastJobSummary
                  job={lastJob}
                  expanded={expandedLog === lastJob.id}
                  onToggleExpand={() =>
                    setExpandedLog(
                      expandedLog === lastJob.id ? null : lastJob.id
                    )
                  }
                />
              )}
            </div>
          );
        })}

        {/* Runner instructions */}
        <div className="border rounded-lg p-3 bg-muted/30">
          <div className="flex items-start gap-2">
            <Terminal className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">How to run the sync:</p>
              <p>
                1. Click a Sync button above to create the job
              </p>
              <p>
                2. In your terminal, run:{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
                  npx tsx scripts/sync-runner.ts
                </code>
              </p>
              <p>
                3. Complete login in the browser window if needed
              </p>
              <p>
                4. The runner imports data automatically after login
              </p>
            </div>
          </div>
        </div>

        {/* Sync History */}
        <SyncHistory jobs={jobs || []} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActiveJobDisplay({
  job,
  isStale,
  onReset,
  expanded,
  onToggleExpand,
}: {
  job: SyncJob;
  isStale: boolean;
  onReset: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.error;
  const StatusIcon = config.icon;
  const log = Array.isArray(job.log) ? job.log : [];

  return (
    <div className={cn("border rounded-md p-3 space-y-2", config.className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon
            className={cn(
              "h-4 w-4",
              job.status === "running" || job.status === "importing"
                ? "animate-spin"
                : ""
            )}
          />
          <span className="text-sm font-medium">{config.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {isStale && (
            <>
              <AlertTriangle className="h-3 w-3 text-yellow-600" />
              <Button variant="ghost" size="sm" onClick={onReset} className="h-6 text-xs">
                <RotateCcw className="mr-1 h-3 w-3" />
                Reset
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={onToggleExpand} className="h-6 px-1">
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>

      {job.status === "waiting_for_login" && (
        <p className="text-xs">
          Check the browser window — complete login there (including 2FA if needed).
        </p>
      )}

      {job.status === "pending" && (
        <p className="text-xs">
          Run <code className="bg-background/50 px-1 rounded">npx tsx scripts/sync-runner.ts</code> in your terminal to start.
        </p>
      )}

      {/* Log entries */}
      {expanded && log.length > 0 && (
        <div className="mt-2 max-h-48 overflow-y-auto text-xs font-mono space-y-0.5 bg-background/50 rounded p-2">
          {log.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground whitespace-nowrap">
                {new Date(entry.ts).toLocaleTimeString()}
              </span>
              <span>{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LastJobSummary({
  job,
  expanded,
  onToggleExpand,
}: {
  job: SyncJob;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.error;
  const StatusIcon = config.icon;
  const log = Array.isArray(job.log) ? job.log : [];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <StatusIcon className="h-3 w-3" />
          <span>
            {config.label}
            {job.records_synced > 0 && ` — ${job.records_synced} records`}
          </span>
          {job.completed_at && (
            <span className="text-muted-foreground">
              {formatDistanceToNow(parseISO(job.completed_at), {
                addSuffix: true,
              })}
            </span>
          )}
        </div>
        {log.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onToggleExpand} className="h-5 px-1">
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>

      {job.error_message && (
        <p className="text-xs text-red-500">{job.error_message}</p>
      )}

      {expanded && log.length > 0 && (
        <div className="max-h-48 overflow-y-auto text-xs font-mono space-y-0.5 bg-muted/50 rounded p-2">
          {log.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground whitespace-nowrap">
                {new Date(entry.ts).toLocaleTimeString()}
              </span>
              <span>{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SyncHistory({ jobs }: { jobs: SyncJob[] }) {
  const completedJobs = jobs.filter((j) =>
    ["completed", "error"].includes(j.status)
  );

  if (completedJobs.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Recent Sync History
      </h4>
      <div className="space-y-1">
        {completedJobs.slice(0, 8).map((job) => {
          const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.error;
          const StatusIcon = config.icon;
          return (
            <div
              key={job.id}
              className="flex items-center justify-between text-xs py-1 border-b last:border-0"
            >
              <div className="flex items-center gap-2">
                <StatusIcon className="h-3 w-3" />
                <span className="font-medium">
                  {PLATFORM_NAMES[job.platform] || job.platform}
                </span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>{job.records_synced} rec</span>
                {job.completed_at && (
                  <span>
                    {formatDistanceToNow(parseISO(job.completed_at), {
                      addSuffix: true,
                    })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

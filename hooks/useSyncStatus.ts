"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface DataSource {
  platform: string;
  display_name: string | null;
  is_active: boolean;
  config: Record<string, unknown> | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export function useSyncStatus() {
  return useQuery<DataSource[]>({
    queryKey: ["data-sources"],
    queryFn: async () => {
      const response = await fetch("/api/data-sources");
      if (!response.ok) {
        throw new Error(`Data sources fetch failed: ${response.statusText}`);
      }
      return response.json();
    },
  });
}

export function useTriggerSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      platform,
      fullSync = false,
    }: {
      platform: string;
      fullSync?: boolean;
    }) => {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, fullSync }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          (error as { message?: string }).message || "Sync failed"
        );
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

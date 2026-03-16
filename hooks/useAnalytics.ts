"use client";

import { useQuery } from "@tanstack/react-query";

interface AnalyticsParams {
  startDate: string;
  endDate: string;
  platform?: string;
  granularity?: "daily" | "weekly" | "monthly";
}

interface AnalyticsResponse {
  aggregates: Record<string, unknown>[];
  totals: Record<string, number>;
  previousTotals: Record<string, number>;
}

export function useAnalytics(params: AnalyticsParams) {
  const { startDate, endDate, platform, granularity } = params;

  return useQuery<AnalyticsResponse>({
    queryKey: ["analytics", startDate, endDate, platform, granularity],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        startDate,
        endDate,
      });
      if (platform) searchParams.set("platform", platform);
      if (granularity) searchParams.set("granularity", granularity);

      const response = await fetch(`/api/analytics?${searchParams}`);
      if (!response.ok) {
        throw new Error(`Analytics fetch failed: ${response.statusText}`);
      }
      return response.json();
    },
  });
}

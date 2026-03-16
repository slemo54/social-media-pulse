"use client";

import { useQuery } from "@tanstack/react-query";

export interface TagAnalytic {
  tag: string;
  label: string;
  category: string | null;
  episodeCount: number;
  avgDownloads: number;
  avgViews: number;
  trend: number;
}

export interface TagAnalyticsData {
  tags: TagAnalytic[];
  allTags: TagAnalytic[];
  categories: string[];
}

interface UseTagAnalyticsParams {
  startDate: string;
  endDate: string;
}

export function useTagAnalytics({ startDate, endDate }: UseTagAnalyticsParams) {
  return useQuery<TagAnalyticsData>({
    queryKey: ["tag-analytics", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/tags?${params}`);
      if (!res.ok) throw new Error("Failed to fetch tag analytics");
      return res.json();
    },
  });
}

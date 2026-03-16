"use client";

import { useQuery } from "@tanstack/react-query";

export interface ExecutiveKPIs {
  downloads: number;
  views: number;
  sessions: number;
  listeners: number;
  reach: number;
}

export interface TrendPoint {
  date: string;
  value: number;
  ma7: number;
}

export interface SparklinePoint {
  date: string;
  downloads: number;
  views: number;
  sessions: number;
  listeners: number;
  reach: number;
}

export interface TopEpisode {
  id: string;
  title: string;
  series: string | null;
  pub_date: string | null;
  downloads: number;
  views: number;
  reach: number;
}

export interface SeriesPerformance {
  series: string;
  episodeCount: number;
  avgDownloads: number;
  trend: number;
}

export interface HeatmapDay {
  day: string;
  downloads: number;
  views: number;
  sessions: number;
}

export interface ExecutiveData {
  totals: ExecutiveKPIs;
  prevTotals: ExecutiveKPIs;
  trendData: TrendPoint[];
  sparklineData: SparklinePoint[];
  topEpisodes: TopEpisode[];
  seriesPerformance: SeriesPerformance[];
  heatmap: HeatmapDay[];
}

interface UseExecutiveDataParams {
  startDate: string;
  endDate: string;
  metric?: string;
}

export function useExecutiveData({ startDate, endDate, metric = "downloads" }: UseExecutiveDataParams) {
  return useQuery<ExecutiveData>({
    queryKey: ["executive", startDate, endDate, metric],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate, metric });
      const res = await fetch(`/api/executive?${params}`);
      if (!res.ok) throw new Error("Failed to fetch executive data");
      return res.json();
    },
  });
}

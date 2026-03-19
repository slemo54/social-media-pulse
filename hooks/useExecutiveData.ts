"use client";

import { useQuery } from "@tanstack/react-query";

export interface ExecutiveResponse {
  period: {
    start: string;
    end: string;
    prevStart: string;
    prevEnd: string;
  };

  siteKPIs: {
    sessions: number;
    prevSessions: number;
    users: number;
    prevUsers: number;
    pageViews: number;
    prevPageViews: number;
    avgSessionDuration: number;
    prevAvgSessionDuration: number;
    bounceRate: number;
    prevBounceRate: number;
    contentPublished: {
      total: number;
      videos: number;
      podcasts: number;
      prevTotal: number;
    };
  };

  siteTrend: {
    daily: Array<{ date: string; sessions: number; users: number }>;
    contentMarkers: Array<{
      date: string;
      type: "video" | "podcast";
      title: string;
    }>;
    summary: {
      avgDailySessions: number;
      bestDay: { date: string; sessions: number };
      withPublicationAvg: number;
      withoutPublicationAvg: number;
      publicationLift: number;
    };
  };

  trafficSources: Array<{
    channel: string;
    sessions: number;
    users: number;
    percentage: number;
  }>;
  topCountries: Array<{
    country: string;
    sessions: number;
    percentage: number;
  }>;
  deviceBreakdown: Array<{
    device: string;
    sessions: number;
    percentage: number;
  }>;

  topPages: Array<{
    page: string;
    views: number;
    users: number;
    avgDuration: number;
  }>;
  topYouTubeContent: Array<{
    title: string;
    publishedAt: string | null;
    views: number;
    viewsPercent: number;
    watchTimeHours: number;
    likes: number;
    subscribersGained: number;
    avgViewDurationSeconds: number;
    avgViewPercentage: number;
  }>;
  youtubeChannelSummary: {
    totalViews: number;
    totalWatchTimeHours: number;
    totalSubscribersGained: number;
    totalLikes: number;
  } | null;
  youtubeInsights: string[];
  topAudioContent: Array<{
    title: string;
    plays: number;
    isLifetime: true;
  }>;

  editorialImpact: {
    totalPublished: number;
    videos: number;
    podcasts: number;
    avgSessionsWithPublication: number;
    avgSessionsWithoutPublication: number;
    publicationLiftPercent: number;
    avg48hEffect: number;
    bestContent: {
      title: string;
      type: "video" | "podcast";
      sessionsDelta: number;
      sessionsDeltaPercent: number;
    } | null;
  };

  insights: string[];
  recommendation: string;
  lastSyncAt: string | null;
}

interface UseExecutiveDataParams {
  startDate: string;
  endDate: string;
}

export function useExecutiveData({ startDate, endDate }: UseExecutiveDataParams) {
  return useQuery<ExecutiveResponse>({
    queryKey: ["executive", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/executive?${params}`);
      if (!res.ok) throw new Error("Failed to fetch executive data");
      return res.json();
    },
  });
}

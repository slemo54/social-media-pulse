"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface EpisodeParams {
  search?: string;
  series?: string;
  page?: number;
}

interface EpisodeRow {
  id: string;
  title: string;
  description: string | null;
  audio_url: string | null;
  duration: number | null;
  pub_date: string | null;
  series: string | null;
  downloads?: number | null;
  views?: number | null;
}

interface EpisodesResponse {
  episodes: EpisodeRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function useEpisodes(params: EpisodeParams = {}) {
  const { search, series, page = 1 } = params;
  const queryClient = useQueryClient();

  const query = useQuery<EpisodesResponse>({
    queryKey: ["episodes", search, series, page],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (search) searchParams.set("search", search);
      if (series) searchParams.set("series", series);
      searchParams.set("page", page.toString());

      const response = await fetch(`/api/episodes?${searchParams}`);
      if (!response.ok) {
        throw new Error(`Episodes fetch failed: ${response.statusText}`);
      }
      return response.json();
    },
  });

  const importMutation = useMutation({
    mutationFn: async (feedUrl: string) => {
      const response = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          (error as { message?: string }).message || "Import failed"
        );
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["episodes"] });
    },
  });

  return {
    episodes: query.data?.episodes ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? 1,
    pageSize: query.data?.pageSize ?? 20,
    isLoading: query.isLoading,
    error: query.error,
    importRSS: importMutation.mutate,
    isImporting: importMutation.isPending,
  };
}

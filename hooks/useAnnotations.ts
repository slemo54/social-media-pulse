"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Annotation } from "@/types/database";

interface UseAnnotationsParams {
  startDate?: string;
  endDate?: string;
}

export function useAnnotations({ startDate, endDate }: UseAnnotationsParams = {}) {
  const queryClient = useQueryClient();

  const query = useQuery<{ annotations: Annotation[] }>({
    queryKey: ["annotations", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/annotations?${params}`);
      if (!res.ok) throw new Error("Failed to fetch annotations");
      return res.json();
    },
  });

  const createAnnotation = useMutation({
    mutationFn: async (body: { date: string; note: string; category: string }) => {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create annotation");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["annotations"] }),
  });

  const updateAnnotation = useMutation({
    mutationFn: async (body: { id: string; date: string; note: string; category: string }) => {
      const res = await fetch("/api/annotations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update annotation");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["annotations"] }),
  });

  const deleteAnnotation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/annotations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to delete annotation");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["annotations"] }),
  });

  return {
    annotations: query.data?.annotations || [],
    isLoading: query.isLoading,
    createAnnotation: createAnnotation.mutate,
    updateAnnotation: updateAnnotation.mutate,
    deleteAnnotation: (id: string) => deleteAnnotation.mutate(id),
    isCreating: createAnnotation.isPending,
  };
}

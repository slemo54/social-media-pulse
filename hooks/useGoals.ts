"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface GoalWithProgress {
  id: string;
  metric_name: string;
  target_value: number;
  period: string;
  created_at: string;
  currentValue: number;
  percentage: number;
}

export function useGoals() {
  const queryClient = useQueryClient();

  const query = useQuery<{ goals: GoalWithProgress[] }>({
    queryKey: ["goals"],
    queryFn: async () => {
      const res = await fetch("/api/goals");
      if (!res.ok) throw new Error("Failed to fetch goals");
      return res.json();
    },
  });

  const createGoal = useMutation({
    mutationFn: async (body: { metric_name: string; target_value: number; period: string }) => {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create goal");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
  });

  const updateGoal = useMutation({
    mutationFn: async (body: { id: string; metric_name: string; target_value: number; period: string }) => {
      const res = await fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update goal");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/goals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to delete goal");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
  });

  return {
    goals: query.data?.goals || [],
    isLoading: query.isLoading,
    createGoal: createGoal.mutate,
    updateGoal: updateGoal.mutate,
    deleteGoal: (id: string) => deleteGoal.mutate(id),
    isCreating: createGoal.isPending,
    isUpdating: updateGoal.isPending,
    isDeleting: deleteGoal.isPending,
  };
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Task, CreateTask, UpdateTask } from "@shared/schemas";

export function useTasks(projectId?: string | null) {
  return useQuery({
    queryKey: ["tasks", projectId ?? "all"],
    queryFn: () =>
      api.tasks.list(projectId ? { projectId } : undefined) as Promise<Task[]>,
    staleTime: 30_000,
    enabled: projectId !== undefined, // allow null (returns all) but not skip entirely
  });
}

export function useAllTasks() {
  return useQuery({
    queryKey: ["tasks", "all"],
    queryFn: () => api.tasks.list() as Promise<Task[]>,
    staleTime: 30_000,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTask) =>
      api.tasks.create(data as Record<string, unknown>) as Promise<Task>,
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] }); // updates trackedSeconds
      toast.success(`Task "${task.name}" created`);
    },
    onError: () => toast.error("Failed to create task"),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTask }) =>
      api.tasks.update(id, data as Record<string, unknown>) as Promise<Task>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: () => toast.error("Failed to update task"),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tasks.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task deleted");
    },
    onError: () => toast.error("Failed to delete task"),
  });
}

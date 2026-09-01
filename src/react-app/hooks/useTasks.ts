import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import { formatDueDate } from "@/lib/taskUtils";
import {
  describeRecurRule,
  nextOccurrence,
  todayLocalDate,
} from "@shared/task-recurrence";
import type { Task, CreateTask, UpdateTask } from "@shared/schemas";

// The API hides inactive (done) tasks unless asked, so every list here opts in:
// the Tasks page offers an All/Active/Done filter and a "Done" group, and without
// this the done tasks never arrive — marking one done made it vanish with no way
// to see it again, and the Done filter was permanently empty.
export function useTasks(projectId?: string | null) {
  return useQuery({
    queryKey: ["tasks", projectId ?? "all", "withDone"],
    queryFn: () =>
      api.tasks.list({
        ...(projectId ? { projectId } : {}),
        includeInactive: "true",
      }) as Promise<Task[]>,
    staleTime: 30_000,
    enabled: projectId !== undefined, // allow null (returns all) but not skip entirely
  });
}

export function useAllTasks() {
  return useQuery({
    queryKey: ["tasks", "all", "withDone"],
    queryFn: () => api.tasks.list({ includeInactive: "true" }) as Promise<Task[]>,
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
    // Patch the cached lists first so a checkbox, a due chip or a drag settles
    // on the frame it was clicked. Every task list shares the ["tasks"] prefix,
    // so one pass covers the page, the rail and the in-project list.
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const snapshot = queryClient.getQueriesData<Task[]>({ queryKey: ["tasks"] });
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
        old?.map((t) => {
          if (t.id === id) {
            return {
              ...t,
              ...(data.name !== undefined ? { name: data.name } : {}),
              ...(data.active !== undefined ? { active: data.active } : {}),
              ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
              ...(data.priority !== undefined ? { priority: data.priority } : {}),
              ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
              ...(data.estimatedSeconds !== undefined
                ? { estimatedSeconds: data.estimatedSeconds }
                : {}),
            };
          }
          // Ticking a parent ticks its children server-side; mirror that here or
          // the subtask rows stay open until the refetch lands.
          if (data.active !== undefined && t.parentId === id) {
            return { ...t, active: data.active };
          }
          return t;
        })
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toast.error("Failed to update task");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

/**
 * Tick a task done (or reopen it), and close the loop back to tracked time.
 *
 * Two things happen here that a bare `active: false` can't do:
 *
 * 1. It sends `completedOn` — the browser's own local date — which is what the
 *    worker measures the next recurrence from. The worker runs in UTC and must
 *    never derive "the next weekday" from its own clock.
 * 2. A task completed with **no tracked time at all** raises a toast offering to
 *    log it. A done task with zero hours is the failure mode this whole feature
 *    exists to prevent, and it is invisible everywhere else in the app. It's a
 *    toast rather than a dialog on purpose: the common case is that you already
 *    tracked the time, and that case must cost nothing.
 */
export function useCompleteTask() {
  const update = useUpdateTask();
  const openTaskLogTime = useUIStore((s) => s.openTaskLogTime);

  return (task: Task, done: boolean) => {
    update.mutate(
      {
        id: task.id,
        data: done ? { active: false, completedOn: todayLocalDate() } : { active: true },
      },
      {
        onSuccess: () => {
          if (!done) return;

          if (task.recurRule) {
            const due = nextOccurrence(task.recurRule, todayLocalDate());
            toast.success(`${task.name} — done`, {
              description: due
                ? `${describeRecurRule(task.recurRule)}. Next due ${formatDueDate(due)}.`
                : undefined,
            });
            return;
          }

          if (task.trackedSeconds === 0) {
            toast(`${task.name} — done`, {
              description: "No time is tracked against this task.",
              action: { label: "Log time", onClick: () => openTaskLogTime(task.id) },
            });
          }
        },
      }
    );
  };
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

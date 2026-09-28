import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { create } from "zustand";
import { api, isQueuedOffline, mutationErrorMessage } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import { formatDueDate } from "@/lib/taskUtils";
import {
  describeRecurRule,
  nextOccurrence,
  todayLocalDate,
} from "@timetracker/core/task-recurrence";
import type { Task, CreateTask, UpdateTask } from "@timetracker/core/schemas";

/** How long a deleted task can be brought back before the DELETE is sent. */
const DELETE_UNDO_MS = 6000;

/**
 * Tasks deleted in this tab whose DELETE hasn't been sent yet.
 *
 * Deletion waits out the undo window instead of re-creating the task on undo:
 * a re-created task would get a new id, and every entry logged against the old
 * one would lose its link. Hidden through `select` rather than cut from the
 * cache, so a refetch inside the window — the socket, a window focus — can't
 * resurrect the row, and undo is instant with no request at all.
 */
const usePendingTaskDeletes = create<{ ids: ReadonlySet<string> }>(() => ({ ids: new Set() }));

function setPendingDelete(id: string, pending: boolean) {
  usePendingTaskDeletes.setState((s) => {
    const ids = new Set(s.ids);
    if (pending) ids.add(id);
    else ids.delete(id);
    return { ids };
  });
}

/** Commits for deletes still in their undo window, flushed if the page unloads. */
const pendingCommits = new Map<string, () => void>();
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const commit of [...pendingCommits.values()]) commit();
  });
}

function useHidePendingDeletes() {
  const ids = usePendingTaskDeletes((s) => s.ids);
  return useCallback(
    (tasks: Task[]) =>
      ids.size
        ? tasks.filter((t) => !ids.has(t.id) && !(t.parentId && ids.has(t.parentId)))
        : tasks,
    [ids]
  );
}

/** Drop a task and its subtasks from every cached task list. */
function removeFromTaskCache(queryClient: QueryClient, id: string) {
  queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
    old?.filter((t) => t.id !== id && t.parentId !== id)
  );
}

// The API hides inactive (done) tasks unless asked, so every list here opts in:
// the Tasks page offers an All/Active/Done filter and a "Done" group, and without
// this the done tasks never arrive — marking one done made it vanish with no way
// to see it again, and the Done filter was permanently empty.
export function useTasks(projectId?: string | null) {
  const select = useHidePendingDeletes();
  return useQuery({
    queryKey: ["tasks", projectId ?? "all", "withDone"],
    queryFn: () =>
      api.tasks.list({
        ...(projectId ? { projectId } : {}),
        includeInactive: "true",
      }) as Promise<Task[]>,
    staleTime: 30_000,
    enabled: projectId !== undefined, // allow null (returns all) but not skip entirely
    select,
  });
}

export function useAllTasks() {
  const select = useHidePendingDeletes();
  return useQuery({
    queryKey: ["tasks", "all", "withDone"],
    queryFn: () => api.tasks.list({ includeInactive: "true" }) as Promise<Task[]>,
    staleTime: 30_000,
    select,
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
    onError: (err) =>
      isQueuedOffline(err)
        ? toast.info("Offline — the task will be saved when you reconnect")
        : toast.error(mutationErrorMessage(err, "Failed to create task")),
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
    onError: (err, _vars, context) => {
      if (isQueuedOffline(err)) {
        // Keep the optimistic value — the write is queued, not lost.
        toast.info("Offline — the task will be updated when you reconnect");
        return;
      }
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toast.error(mutationErrorMessage(err, "Failed to update task"));
    },
    // A refetch while offline would fail and drop the optimistic row anyway;
    // the queue drain invalidates once the write has actually landed.
    onSettled: (_data, err) => {
      if (isQueuedOffline(err)) return;
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/** The PUT's response: the task, plus the occurrence a repeating one spawned. */
type CompletedTask = Task & { spawnedTaskId?: string | null };

/**
 * Tick a task done (or reopen it), and close the loop back to tracked time.
 *
 * Three things happen here that a bare `active: false` can't do:
 *
 * 1. It sends `completedOn` — the browser's own local date — which is what the
 *    worker measures the next recurrence from. The worker runs in UTC and must
 *    never derive "the next weekday" from its own clock.
 * 2. A task completed with **no tracked time at all** raises a toast offering to
 *    log it. A done task with zero hours is the failure mode this whole feature
 *    exists to prevent, and it is invisible everywhere else in the app. It's a
 *    toast rather than a dialog on purpose: the common case is that you already
 *    tracked the time, and that case must cost nothing.
 * 3. Every completion can be undone from its toast. Unticking isn't enough on
 *    its own: a done row leaves most views, and a repeating task has already
 *    spawned its next occurrence and handed that occurrence the rule. Undo
 *    deletes the spawned occurrence and reopens this one *with* the rule, so
 *    the round trip leaves no duplicate behind.
 *
 * `mutateAsync`, not `mutate`'s callbacks: completing a row usually unmounts it
 * (it moves group, or leaves an "active" view), and per-call callbacks never
 * fire for an unmounted observer — the toast silently didn't appear.
 */
export function useCompleteTask() {
  const queryClient = useQueryClient();
  const update = useUpdateTask();
  const openTaskLogTime = useUIStore((s) => s.openTaskLogTime);

  return (task: Task, done: boolean) => {
    const data: UpdateTask = done
      ? { active: false, completedOn: todayLocalDate() }
      : { active: true };

    update
      .mutateAsync({ id: task.id, data })
      .then((result) => {
        if (!done) return;
        const spawnedId = (result as CompletedTask).spawnedTaskId ?? null;

        const undo = () => {
          if (spawnedId) {
            removeFromTaskCache(queryClient, spawnedId);
            api.tasks.delete(spawnedId).catch((err) => {
              if (!isQueuedOffline(err)) toast.error(mutationErrorMessage(err, "Failed to undo"));
            });
          }
          update.mutate({
            id: task.id,
            data: { active: true, ...(spawnedId ? { recurRule: task.recurRule } : {}) },
          });
        };
        const undoAction = { label: "Undo", onClick: undo };

        if (task.recurRule) {
          const due = nextOccurrence(task.recurRule, todayLocalDate());
          toast.success(`${task.name} — done`, {
            description: due
              ? `${describeRecurRule(task.recurRule)}. Next due ${formatDueDate(due)}.`
              : undefined,
            action: undoAction,
          });
          return;
        }

        if (task.trackedSeconds === 0) {
          toast(`${task.name} — done`, {
            description: "No time is tracked against this task.",
            action: { label: "Log time", onClick: () => openTaskLogTime(task.id) },
            cancel: undoAction,
          });
          return;
        }

        toast(`${task.name} — done`, { action: undoAction });
      })
      // Failures are reported by useUpdateTask's own onError (and an offline
      // write is queued, not failed); nothing further to say here.
      .catch(() => {});
  };
}

/**
 * Delete a task (and its subtasks) with a window to take it back.
 *
 * Replaces the confirm dialog: a confirm is asked every time and read almost
 * never, where an undo costs nothing unless you need it. The DELETE is sent
 * when the toast closes on its own or is dismissed (Sonner pauses its timer
 * while the toast is hovered or the tab is hidden, so the window can't expire
 * under the pointer), and on page unload with `keepalive`.
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useCallback(
    (task: Task) => {
      let settled = false;
      setPendingDelete(task.id, true);

      const commit = (keepalive = false) => {
        if (settled) return;
        settled = true;
        pendingCommits.delete(task.id);
        api.tasks
          .delete(task.id, { keepalive })
          .then(
            () => {
              // Out of the cache before out of the pending set, or the stale
              // row shows for the length of the refetch.
              removeFromTaskCache(queryClient, task.id);
              setPendingDelete(task.id, false);
              void queryClient.invalidateQueries({ queryKey: ["tasks"] });
            },
            (err) => {
              if (isQueuedOffline(err)) {
                removeFromTaskCache(queryClient, task.id);
                toast.info("Offline — the task will be deleted when you reconnect");
              } else {
                toast.error(mutationErrorMessage(err, "Failed to delete task"));
              }
              setPendingDelete(task.id, false);
            }
          );
      };

      const undo = () => {
        if (settled) return;
        settled = true;
        pendingCommits.delete(task.id);
        setPendingDelete(task.id, false);
      };

      pendingCommits.set(task.id, () => commit(true));

      const subtasks = task.subtaskTotal;
      toast(`Deleted "${task.name}"`, {
        description: subtasks
          ? `And its ${subtasks} subtask${subtasks === 1 ? "" : "s"}. Time already tracked is kept.`
          : undefined,
        duration: DELETE_UNDO_MS,
        action: { label: "Undo", onClick: undo },
        onAutoClose: () => commit(),
        onDismiss: () => commit(),
      });
    },
    [queryClient]
  );
}

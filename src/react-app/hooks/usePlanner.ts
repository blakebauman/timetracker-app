import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Allocation, UpsertAllocation, BulkUpsertAllocations } from "@shared/schemas";

// Planned allocations for a [since, until) range of local YYYY-MM-DD dates.
// Keyed by the plain date strings (not ISO timestamps) — allocations are
// date-keyed with no timezone component.
export function useAllocationsRange(sinceDate: string, untilDate: string) {
  return useQuery({
    queryKey: ["planner-allocations", sinceDate, untilDate],
    queryFn: () =>
      api.planner.list({ since: sinceDate, until: untilDate }) as Promise<Allocation[]>,
  });
}

// Variables carry the joined display fields so the optimistic insert can render
// a complete row without waiting for the server echo.
export interface UpsertAllocationVars extends UpsertAllocation {
  projectName: string | null;
  projectColor: string | null;
  taskName: string | null;
}

const cellMatches = (a: Allocation, v: UpsertAllocation) =>
  a.projectId === v.projectId && (a.taskId ?? null) === (v.taskId ?? null) && a.date === v.date;

export function useUpsertAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: UpsertAllocationVars) =>
      api.planner.upsert({
        projectId: vars.projectId,
        taskId: vars.taskId ?? null,
        date: vars.date,
        plannedSeconds: vars.plannedSeconds,
      }),
    // Optimistic: patch/remove/insert the matching cell so commit-on-blur lands
    // instantly (same shape as useUpdateEntry/useDeleteEntry).
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["planner-allocations"] });
      const prev = queryClient.getQueriesData<Allocation[]>({
        queryKey: ["planner-allocations"],
      });
      queryClient.setQueriesData<Allocation[]>({ queryKey: ["planner-allocations"] }, (old) => {
        if (!old) return old;
        if (vars.plannedSeconds === 0) return old.filter((a) => !cellMatches(a, vars));
        const existing = old.find((a) => cellMatches(a, vars));
        if (existing) {
          return old.map((a) =>
            cellMatches(a, vars) ? { ...a, plannedSeconds: vars.plannedSeconds } : a
          );
        }
        return [
          ...old,
          {
            id: `optimistic-${vars.projectId}-${vars.taskId ?? ""}-${vars.date}`,
            projectId: vars.projectId,
            taskId: vars.taskId ?? null,
            date: vars.date,
            plannedSeconds: vars.plannedSeconds,
            projectName: vars.projectName,
            projectColor: vars.projectColor,
            taskName: vars.taskName,
            updatedAt: new Date().toISOString(),
          },
        ];
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error("Failed to save plan");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planner-allocations"] });
    },
  });
}

// Used behind explicit dialogs/buttons (CSV import, copy last week) — no
// optimistic patching, just invalidate on success.
export function useBulkUpsertAllocations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkUpsertAllocations) =>
      api.planner.bulkUpsert(body as unknown as { allocations: Record<string, unknown>[] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planner-allocations"] });
    },
    onError: () => toast.error("Failed to save plan"),
  });
}

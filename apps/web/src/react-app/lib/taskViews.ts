import { useTaskViews } from "@/hooks/useTasks";
import type { TaskViewConfig } from "@timetracker/core/schemas";

/** The part of a view's config the filter popover edits. */
export type TaskFilterValues = Pick<TaskViewConfig, "status" | "projectId" | "tag" | "maxPriority" | "due">;

export const NO_FILTERS: TaskFilterValues = {
  status: "all",
  projectId: null,
  tag: null,
  maxPriority: null,
  due: "any",
};

export function activeFilterCount(f: TaskFilterValues): number {
  return (
    (f.status !== "all" ? 1 : 0) +
    (f.projectId ? 1 : 0) +
    (f.tag ? 1 : 0) +
    (f.maxPriority ? 1 : 0) +
    (f.due !== "any" ? 1 : 0)
  );
}

/** Same configuration, field by field — what makes a saved view "the one showing". */
export function sameConfig(a: TaskViewConfig, b: TaskViewConfig): boolean {
  return (Object.keys(a) as (keyof TaskViewConfig)[]).every((k) => a[k] === b[k]);
}

/** The saved view whose configuration is exactly what's on screen, if any. */
export function useActiveTaskView(activeViewId: string | null, current: TaskViewConfig) {
  const { data: views = [] } = useTaskViews();
  return views.find((v) => v.id === activeViewId && sameConfig(v.config, current)) ?? null;
}

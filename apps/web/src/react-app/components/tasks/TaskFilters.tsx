import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjects, useTags } from "@/hooks/useProjects";
import { useCreateTaskView, useDeleteTaskView, useTaskViews } from "@/hooks/useTasks";
import {
  NO_FILTERS,
  activeFilterCount,
  useActiveTaskView,
  type TaskFilterValues,
} from "@/lib/taskViews";
import { PRIORITY_LABEL } from "@/lib/taskUtils";
import type { Project, TaskViewConfig } from "@timetracker/core/schemas";

const ANY = "__any";

export type TaskGroupBy = TaskViewConfig["groupBy"];
export type TaskSortBy = TaskViewConfig["sortBy"];

/**
 * Everything that shapes the All tab — saved view, grouping, sort, and the
 * status / project / tag / priority / due filters — behind one button.
 *
 * The header used to carry search, Filter, Group and Sort side by side: four
 * controls about *how to look at* the list, all at the same weight as the list
 * itself, before a single task. They are set once and left, so they live one
 * click away and the header keeps only where you are and what you're looking for.
 */
export function TaskViewPopover({
  value,
  onChange,
  groupBy,
  onGroupByChange,
  sortBy,
  onSortByChange,
  viewName = null,
  viewSlot,
}: {
  value: TaskFilterValues;
  onChange: (next: TaskFilterValues) => void;
  groupBy: TaskGroupBy;
  onGroupByChange: (next: TaskGroupBy) => void;
  sortBy: TaskSortBy;
  onSortByChange: (next: TaskSortBy) => void;
  /** The saved view on screen, if any — the button wears its name. */
  viewName?: string | null;
  /** The saved-views picker, rendered at the top of the popover. */
  viewSlot?: ReactNode;
}) {
  const { data: projects = [] } = useProjects();
  const { data: tags = [] } = useTags();
  const count = activeFilterCount(value);
  const set = (patch: Partial<TaskFilterValues>) => onChange({ ...value, ...patch });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          aria-label={
            viewName
              ? `View: ${viewName}`
              : count
                ? `View, ${count} filter${count === 1 ? "" : "s"} active`
                : "View"
          }
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {viewName ? (
            <span className="max-w-32 truncate">{viewName}</span>
          ) : (
            <>
              View
              {count > 0 && <span className="tabular-nums text-muted-foreground">{count}</span>}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        {viewSlot && (
          <div className="space-y-1.5">
            <Label>Saved view</Label>
            {viewSlot}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 border-b pb-3">
          <div className="space-y-1.5">
            <Label>Group</Label>
            <Select value={groupBy} onValueChange={(v) => onGroupByChange(v as TaskGroupBy)}>
              <SelectTrigger size="sm" className="w-full" aria-label="Group by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="due">Due date</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Sort</Label>
            <Select value={sortBy} onValueChange={(v) => onSortByChange(v as TaskSortBy)}>
              <SelectTrigger size="sm" className="w-full" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* "plan" is due date, then priority, then your drag order —
                    named for what the reader sees, not for the comparator. */}
                <SelectItem value="plan">Due date</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="recent">Newest</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="estimate">Estimate</SelectItem>
                <SelectItem value="tracked">Time tracked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Show</Label>
          <Select value={value.status} onValueChange={(v) => set({ status: v as TaskFilterValues["status"] })}>
            <SelectTrigger size="sm" className="w-full" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Open</SelectItem>
              <SelectItem value="all">Open and done</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Project</Label>
          <Select value={value.projectId ?? ANY} onValueChange={(v) => set({ projectId: v === ANY ? null : v })}>
            <SelectTrigger size="sm" className="w-full" aria-label="Filter by project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any project</SelectItem>
              {projects.map((p: Project) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tag</Label>
          <Select value={value.tag ?? ANY} onValueChange={(v) => set({ tag: v === ANY ? null : v })}>
            <SelectTrigger size="sm" className="w-full" aria-label="Filter by tag">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any tag</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.name}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select
            value={value.maxPriority ? String(value.maxPriority) : ANY}
            onValueChange={(v) => set({ maxPriority: v === ANY ? null : Number(v) })}
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Filter by priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any priority</SelectItem>
              <SelectItem value="1">{PRIORITY_LABEL[1]} only</SelectItem>
              <SelectItem value="2">{PRIORITY_LABEL[2]} and above</SelectItem>
              <SelectItem value="3">{PRIORITY_LABEL[3]} and above</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Due</Label>
          <Select value={value.due} onValueChange={(v) => set({ due: v as TaskFilterValues["due"] })}>
            <SelectTrigger size="sm" className="w-full" aria-label="Filter by due date">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any time</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Next 7 days</SelectItem>
              <SelectItem value="none">No due date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {count > 0 && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(NO_FILTERS)}>
            Clear filters
          </Button>
        )}
        {/* The list's keyboard model was invisible anywhere on the page. This
            is where someone tuning how they work the list will look. */}
        <p className="border-t pt-3 text-xs text-muted-foreground">
          <Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>X</Kbd> done · <Kbd>E</Kbd> open · <Kbd>Q</Kbd> add
        </p>
      </PopoverContent>
    </Popover>
  );
}

const SAVE = "__save";
const DELETE = "__delete";
const NONE = "__none";

/**
 * Saved views: pick one to apply its whole configuration; save the current one
 * under a name. Per user, so a view is a personal lens, not a shared setting.
 */
export function TaskViewPicker({
  current,
  activeViewId,
  onApply,
}: {
  current: TaskViewConfig;
  activeViewId: string | null;
  onApply: (id: string | null, config: TaskViewConfig | null) => void;
}) {
  const { data: views = [] } = useTaskViews();
  const createView = useCreateTaskView();
  const deleteView = useDeleteTaskView();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  // Named only while it's what's on screen: change a filter after applying a
  // view and the picker stops claiming that view is showing.
  const active = useActiveTaskView(activeViewId, current);

  const onValueChange = (v: string) => {
    if (v === SAVE) {
      setName("");
      setNaming(true);
      return;
    }
    if (v === DELETE && active) {
      deleteView.mutate(active.id);
      onApply(null, null);
      return;
    }
    if (v === NONE) {
      onApply(null, null);
      return;
    }
    const view = views.find((x) => x.id === v);
    if (view) onApply(view.id, view.config);
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createView.mutate(
      { name: trimmed, config: current },
      {
        onSuccess: (view) => {
          setNaming(false);
          onApply(view.id, view.config);
        },
      }
    );
  };

  return (
    <>
      <Select value={active?.id ?? NONE} onValueChange={onValueChange}>
        <SelectTrigger size="sm" className="w-full" aria-label="Saved view">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {views.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={SAVE}>Save current view…</SelectItem>
          {active && <SelectItem value={DELETE}>Delete “{active.name}”</SelectItem>}
        </SelectContent>
      </Select>

      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Keeps this tab's search, filters, grouping and sort under a name.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="e.g. Urgent this week"
            aria-label="View name"
            maxLength={60}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!name.trim() || createView.isPending}>
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

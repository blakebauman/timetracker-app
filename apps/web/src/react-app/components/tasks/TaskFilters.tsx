import { useState, type ReactNode } from "react";
import { Check, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover as PopoverPrimitive } from "radix-ui";
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
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
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

export type TaskGroupBy = TaskViewConfig["groupBy"];
export type TaskSortBy = TaskViewConfig["sortBy"];

/**
 * Everything that shapes the All tab — saved views, grouping, sort, and the
 * status / project / tag / priority / due filters — behind one button.
 *
 * The header used to carry search, Filter, Group and Sort side by side: four
 * controls about *how to look at* the list, all at the same weight as the list
 * itself, before a single task. They are set once and left, so they live one
 * click away and the header keeps only where you are and what you're looking for.
 *
 * Inside, filters are **added**, not laid out: a column of eight labelled
 * selects, seven of them reading "Any …", was a settings form for a list that
 * is usually unfiltered. What's set shows as a chip; "Filter" adds one more.
 */
const PRIORITY_FILTER_LABEL: Record<number, string> = {
  1: `${PRIORITY_LABEL[1]} only`,
  2: `${PRIORITY_LABEL[2]} and above`,
  3: `${PRIORITY_LABEL[3]} and above`,
};

const DUE_FILTER_LABEL: Record<Exclude<TaskFilterValues["due"], "any">, string> = {
  overdue: "Overdue",
  today: "Due today",
  week: "Next 7 days",
  none: "No due date",
};

const STATUS_OPTIONS: SegmentedOption<TaskFilterValues["status"]>[] = [
  { value: "active", label: "Open" },
  { value: "all", label: "All" },
  { value: "done", label: "Done" },
];

/** A set filter, and the one way to take it off. */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-full border bg-background pr-0.5 pl-2.5 text-xs">
      <span className="truncate">{label}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove filter: ${label}`}
        title="Remove filter"
        onClick={onRemove}
        className="text-muted-foreground"
      >
        <X className="h-3 w-3" />
      </Button>
    </span>
  );
}

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
  /** The saved views, listed at the foot of the popover. */
  viewSlot?: ReactNode;
}) {
  const { data: projects = [] } = useProjects();
  const { data: tags = [] } = useTags();
  const count = activeFilterCount(value);
  const set = (patch: Partial<TaskFilterValues>) => onChange({ ...value, ...patch });
  const projectName = projects.find((p: Project) => p.id === value.projectId)?.name;

  const chips = [
    value.projectId && {
      key: "project",
      label: projectName ?? "Project",
      remove: () => set({ projectId: null }),
    },
    value.tag && { key: "tag", label: `#${value.tag}`, remove: () => set({ tag: null }) },
    value.maxPriority && {
      key: "priority",
      label: PRIORITY_FILTER_LABEL[value.maxPriority],
      remove: () => set({ maxPriority: null }),
    },
    value.due !== "any" && {
      key: "due",
      label: DUE_FILTER_LABEL[value.due],
      remove: () => set({ due: "any" }),
    },
  ].filter(Boolean) as { key: string; label: string; remove: () => void }[];

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
      <PopoverContent align="end" className="w-88 space-y-3">
        <SegmentedControl
          label="Show tasks"
          value={value.status}
          options={STATUS_OPTIONS}
          onChange={(status) => set({ status })}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
        />

        {/* One line, read as a sentence: "Group by project, sort by due date". */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Group</span>
          <Select value={groupBy} onValueChange={(v) => onGroupByChange(v as TaskGroupBy)}>
            <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Group by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="due">Due date</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
          <span>Sort</span>
          <Select value={sortBy} onValueChange={(v) => onSortByChange(v as TaskSortBy)}>
            <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Sort by">
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

        <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
          {chips.map((c) => (
            <FilterChip key={c.key} label={c.label} onRemove={c.remove} />
          ))}
          {chips.length < 4 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2.5 text-xs text-muted-foreground">
                  <Plus className="h-3 w-3" />
                  Filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {!value.projectId && projects.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Project</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                      <DropdownMenuRadioGroup value="" onValueChange={(v) => set({ projectId: v })}>
                        {projects.map((p: Project) => (
                          <DropdownMenuRadioItem key={p.id} value={p.id}>
                            {p.name}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {!value.tag && tags.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Tag</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                      <DropdownMenuRadioGroup value="" onValueChange={(v) => set({ tag: v })}>
                        {tags.map((t) => (
                          <DropdownMenuRadioItem key={t.id} value={t.name}>
                            {t.name}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {!value.maxPriority && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Priority</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup value="" onValueChange={(v) => set({ maxPriority: Number(v) })}>
                        {[1, 2, 3].map((p) => (
                          <DropdownMenuRadioItem key={p} value={String(p)}>
                            {PRIORITY_FILTER_LABEL[p]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {value.due === "any" && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Due</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup
                        value=""
                        onValueChange={(v) => set({ due: v as TaskFilterValues["due"] })}
                      >
                        {(Object.keys(DUE_FILTER_LABEL) as (keyof typeof DUE_FILTER_LABEL)[]).map((d) => (
                          <DropdownMenuRadioItem key={d} value={d}>
                            {DUE_FILTER_LABEL[d]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2.5 text-xs text-muted-foreground"
              onClick={() => onChange(NO_FILTERS)}
            >
              Clear filters
            </Button>
          )}
        </div>

        {viewSlot && <div className="border-t pt-2">{viewSlot}</div>}
      </PopoverContent>
    </Popover>
  );
}

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
      {/* A short list, not a select defaulting to "None": the views you keep
          are a handful, and seeing them is half of remembering to use them. */}
      <ul className="space-y-0.5" aria-label="Saved views">
        {views.map((v) => {
          const on = active?.id === v.id;
          return (
            <li key={v.id} className="flex items-center gap-1">
              {/* Picking a view is the whole errand, so it closes the popover —
                  always, not only when the view's search text pulls focus to
                  the search field and closes it as a side effect. */}
              <PopoverPrimitive.Close asChild>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => (on ? onApply(null, null) : onApply(v.id, v.config))}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-full px-2.5 py-1 text-left text-sm transition-colors duration-fast ease-out-quart hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  on ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", !on && "invisible")} aria-hidden />
                <span className="truncate">{v.name}</span>
              </button>
              </PopoverPrimitive.Close>
              {on && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete saved view ${v.name}`}
                  title="Delete this saved view"
                  onClick={() => {
                    deleteView.mutate(v.id);
                    onApply(null, null);
                  }}
                  className="text-muted-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-full justify-start gap-2 px-2.5 text-xs text-muted-foreground"
        onClick={() => {
          setName("");
          setNaming(true);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        Save current view…
      </Button>

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

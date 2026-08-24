import { useMemo } from "react";
import { X, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect, type MultiSelectOption } from "./MultiSelect";
import { useAllClients, useAllProjects, useTags } from "@/hooks/useProjects";
import { useAllTasks } from "@/hooks/useTasks";

export type BillableFilter = "all" | "billable" | "nonbillable";

export interface ReportFilters {
  clientIds: string[];
  projectIds: string[];
  taskIds: string[];
  tagIds: string[];
  billable: BillableFilter;
  search: string;
}

export const EMPTY_FILTERS: ReportFilters = {
  clientIds: [],
  projectIds: [],
  taskIds: [],
  tagIds: [],
  billable: "all",
  search: "",
};

interface ReportFilterBarProps {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
}

export function ReportFilterBar({ filters, onChange }: ReportFilterBarProps) {
  const { data: clients = [] } = useAllClients();
  const { data: projects = [] } = useAllProjects();
  const { data: tasks = [] } = useAllTasks();
  const { data: tags = [] } = useTags();

  // Cascading: projects narrow to the selected clients; tasks narrow to the
  // selected projects. When nothing upstream is selected, show everything.
  const visibleProjects = useMemo(
    () =>
      filters.clientIds.length
        ? projects.filter(
            (p) => p.clientId && filters.clientIds.includes(p.clientId)
          )
        : projects,
    [projects, filters.clientIds]
  );

  const visibleTasks = useMemo(
    () =>
      filters.projectIds.length
        ? tasks.filter((t) => filters.projectIds.includes(t.projectId))
        : tasks,
    [tasks, filters.projectIds]
  );

  const clientOptions: MultiSelectOption[] = clients.map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const projectOptions: MultiSelectOption[] = visibleProjects.map((p) => ({
    value: p.id,
    label: p.name,
    color: p.color,
  }));
  const taskOptions: MultiSelectOption[] = visibleTasks.map((t) => ({
    value: t.id,
    label: t.name,
  }));
  const tagOptions: MultiSelectOption[] = tags.map((t) => ({
    value: t.id,
    label: t.name,
  }));

  // When clients change, drop project selections outside the new set, then
  // cascade the same pruning down to tasks.
  const setClients = (clientIds: string[]) => {
    const allowedProjects = new Set(
      (clientIds.length
        ? projects.filter((p) => p.clientId && clientIds.includes(p.clientId))
        : projects
      ).map((p) => p.id)
    );
    const projectIds = filters.projectIds.filter((id) => allowedProjects.has(id));
    onChange({ ...pruneTasks(filters, projectIds, tasks), clientIds, projectIds });
  };

  const setProjects = (projectIds: string[]) => {
    onChange({ ...pruneTasks(filters, projectIds, tasks), projectIds });
  };

  const hasAny = Boolean(
    filters.clientIds.length ||
      filters.projectIds.length ||
      filters.taskIds.length ||
      filters.tagIds.length ||
      filters.billable !== "all" ||
      filters.search.trim().length
  );

  // Number of *dimensions* narrowed, not values picked: "Filters 2" means two
  // kinds of narrowing are in play, which is what the reader needs to know
  // before trusting the total. Search sits outside the popover and outside this
  // count, because it stays visible in its own field.
  const activeCount =
    (filters.clientIds.length ? 1 : 0) +
    (filters.projectIds.length ? 1 : 0) +
    (filters.taskIds.length ? 1 : 0) +
    (filters.tagIds.length ? 1 : 0) +
    (filters.billable !== "all" ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search description…"
          className="h-8 w-48 pl-8 text-sm"
        />
      </div>

      {/* Client / Project / Task / Tags / Billable used to sit here as five
          always-open controls. Together with search, rounding and saved reports
          that put nine controls in one band above the numbers — the setup for
          reading a report crowding out the reading. They live behind one button
          now; the count keeps the *fact* of narrowing visible, which is the part
          you need before trusting a total you're about to invoice. */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={activeCount ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1.5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-micro font-medium tabular-nums text-primary-foreground">
                {activeCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-3 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Client</Label>
            <MultiSelect
              label="Client"
              options={clientOptions}
              value={filters.clientIds}
              onChange={setClients}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Project</Label>
            <MultiSelect
              label="Project"
              options={projectOptions}
              value={filters.projectIds}
              onChange={setProjects}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Task</Label>
            <MultiSelect
              label="Task"
              options={taskOptions}
              value={filters.taskIds}
              onChange={(taskIds) => onChange({ ...filters, taskIds })}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tags</Label>
            <MultiSelect
              label="Tags"
              options={tagOptions}
              value={filters.tagIds}
              onChange={(tagIds) => onChange({ ...filters, tagIds })}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="report-billable">
              Billable
            </Label>
            <Select
              value={filters.billable}
              onValueChange={(v) => onChange({ ...filters, billable: v as BillableFilter })}
            >
              <SelectTrigger className="h-8 w-full text-sm" id="report-billable">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entries</SelectItem>
                <SelectItem value="billable">Billable</SelectItem>
                <SelectItem value="nonbillable">Non-billable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasAny && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full gap-1 text-muted-foreground"
              onClick={() => onChange(EMPTY_FILTERS)}
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Prune task selections to those belonging to the (possibly narrowed) project
// set. When no projects are selected, all tasks remain valid.
function pruneTasks(
  filters: ReportFilters,
  projectIds: string[],
  tasks: { id: string; projectId: string }[]
): ReportFilters {
  if (!projectIds.length) return filters;
  const allowedTasks = new Set(
    tasks.filter((t) => projectIds.includes(t.projectId)).map((t) => t.id)
  );
  return { ...filters, taskIds: filters.taskIds.filter((id) => allowedTasks.has(id)) };
}

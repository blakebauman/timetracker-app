import { useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiSelect, type MultiSelectOption } from "./MultiSelect";
import { useAllClients, useAllProjects, useTags } from "@/hooks/useProjects";
import { useAllTasks } from "@/hooks/useTasks";

export interface ReportFilters {
  clientIds: string[];
  projectIds: string[];
  taskIds: string[];
  tagIds: string[];
}

export const EMPTY_FILTERS: ReportFilters = {
  clientIds: [],
  projectIds: [],
  taskIds: [],
  tagIds: [],
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

  const hasAny =
    filters.clientIds.length ||
    filters.projectIds.length ||
    filters.taskIds.length ||
    filters.tagIds.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelect
        label="Client"
        options={clientOptions}
        value={filters.clientIds}
        onChange={setClients}
      />
      <MultiSelect
        label="Project"
        options={projectOptions}
        value={filters.projectIds}
        onChange={setProjects}
      />
      <MultiSelect
        label="Task"
        options={taskOptions}
        value={filters.taskIds}
        onChange={(taskIds) => onChange({ ...filters, taskIds })}
      />
      <MultiSelect
        label="Tags"
        options={tagOptions}
        value={filters.tagIds}
        onChange={(tagIds) => onChange({ ...filters, tagIds })}
      />
      {hasAny > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-muted-foreground"
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
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

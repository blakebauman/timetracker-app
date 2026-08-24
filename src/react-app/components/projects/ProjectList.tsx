import { useState } from "react";
import { Plus, MoreHorizontal, Archive, Edit2, ChevronDown, FolderOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectForm } from "./ProjectForm";
import { TaskList } from "./TaskList";
import {
  useAllProjects,
  useDeleteProject,
  useUpdateProject,
  useProjectPacing,
} from "@/hooks/useProjects";
import { pacingLabel, pacingToneClass } from "@/lib/pacing";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDurationShort, formatPlainDate } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/currency";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { CollectionHeader } from "@/components/layout/CollectionHeader";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProjectSort = "name" | "client" | "tracked" | "rate";
import type { Project } from "@shared/schemas";

export function ProjectList() {
  const { data: projects = [], isLoading } = useAllProjects();
  // Pacing covers active projects only (an archived project has nothing left to
  // pace), so the row falls back to the plain percentage when it's absent.
  const { data: pacing = [] } = useProjectPacing();
  const pacingByProject = new Map(pacing.map((p) => [p.projectId, p]));
  const currency = useUIStore((s) => s.currency);
  const deleteProject = useDeleteProject();
  const updateProject = useUpdateProject();
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  // Two critiques flagged the same gap: at 30 projects this page was a scroll
  // with no way to narrow it, while Clients had a period control and Tasks had
  // three selects. Search matches the client name too — "everything for EY" is
  // how a consultant thinks about their project list.
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<ProjectSort>("name");

  const toggleTasks = (id: string) =>
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const q = query.trim().toLowerCase();
  const visible = projects
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.clientName ?? "").toLowerCase().includes(q)
    )
    .sort((a, b) => {
      switch (sortBy) {
        case "tracked":
          return (b.trackedSeconds ?? 0) - (a.trackedSeconds ?? 0);
        case "client":
          return (a.clientName ?? "\uffff").localeCompare(b.clientName ?? "\uffff")
            || a.name.localeCompare(b.name);
        case "rate":
          return (b.rate ?? -1) - (a.rate ?? -1) || a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name);
      }
    });

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6">
      <CollectionHeader
        title="Projects"
        // While a search is narrowing the list, the count has to describe what
        // is on screen — "4 active" above zero visible rows reads as a bug.
        subtitle={
          q
            ? `${visible.length} of ${projects.length} shown`
            : `${projects.filter((p) => p.active).length} active`
        }
      >
        {projects.length > 0 && (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects…"
                aria-label="Search projects by name or client"
                className="h-8 w-48 pl-8"
              />
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as ProjectSort)}>
              <SelectTrigger className="h-8 w-36" aria-label="Sort projects">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort: Name</SelectItem>
                <SelectItem value="client">Sort: Client</SelectItem>
                <SelectItem value="tracked">Sort: Tracked</SelectItem>
                <SelectItem value="rate">Sort: Rate</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </CollectionHeader>

      <div className="space-y-1.5">
        {visible.map((project) => {
          const budgetPercent =
            project.estimatedHours && project.trackedSeconds !== undefined
              ? Math.min(
                  100,
                  Math.round(
                    (project.trackedSeconds / (project.estimatedHours * 3600)) * 100
                  )
                )
              : null;
          const projectPacing = pacingByProject.get(project.id);
          const paceLabel = projectPacing ? pacingLabel(projectPacing) : null;
          const isExpanded = expandedTasks.has(project.id);

          return (
            <Collapsible
              key={project.id}
              open={isExpanded}
              onOpenChange={() => toggleTasks(project.id)}
            >
              <div className="rounded-lg border bg-card">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          !project.active && "text-muted-foreground line-through"
                        )}
                      >
                        {project.name}
                      </span>
                      {!project.active && (
                        <Badge variant="outline" className="text-xs">Archived</Badge>
                      )}
                      {project.billable && (
                        <Badge variant="secondary" className="text-xs">
                          Billable{project.rate ? ` ${formatCurrency(project.rate, currency)}/h` : ""}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {project.clientName && <span>{project.clientName}</span>}
                      {project.trackedSeconds > 0 && (
                        <span>{formatDurationShort(project.trackedSeconds)} tracked</span>
                      )}
                      {project.endDate && (
                        <span>Due {formatPlainDate(project.endDate)}</span>
                      )}
                    </div>
                    {/* Budget progress bar */}
                    {budgetPercent !== null && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Progress
                              value={budgetPercent}
                              aria-label={`${Math.round(budgetPercent)}% of budget used`}
                              className={cn(
                                "h-1.5 flex-1",
                                budgetPercent >= 100
                                  ? "bg-destructive/20 [&>div]:bg-destructive"
                                  : budgetPercent >= 80
                                  ? "bg-warning/20 [&>div]:bg-warning"
                                  : undefined
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent>{Math.round(budgetPercent)}% of budget used</TooltipContent>
                        </Tooltip>
                        <span className="text-micro tabular-nums text-muted-foreground">
                          {formatDurationShort(project.trackedSeconds)} / {project.estimatedHours}h
                        </span>
                      </div>
                    )}
                    {/* The percentage says where the project is; this says where
                        it's going. Only rendered when there's something specific
                        to report — a dormant project isn't "on pace" for
                        anything, and inventing a verdict for it would cry wolf. */}
                    {paceLabel && projectPacing && (
                      <div
                        className={cn(
                          "mt-1 text-micro font-medium",
                          pacingToneClass(projectPacing.status)
                        )}
                      >
                        {paceLabel}
                      </div>
                    )}
                  </div>

                  {/* Tasks toggle */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          aria-label={isExpanded ? "Hide tasks" : "Show tasks"}
                        >
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 transition-transform duration-fast ease-out-quart",
                              isExpanded && "rotate-180"
                            )}
                          />
                        </Button>
                      </CollapsibleTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{isExpanded ? "Hide tasks" : "Show tasks"}</TooltipContent>
                  </Tooltip>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Project actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditProject(project)}>
                        <Edit2 className="mr-2 h-3.5 w-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          project.active
                            ? deleteProject.mutate(project.id)
                            : updateProject.mutate({ id: project.id, data: { active: true } })
                        }
                      >
                        <Archive className="mr-2 h-3.5 w-3.5" />
                        {project.active ? "Archive" : "Unarchive"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Tasks section */}
                <CollapsibleContent>
                  <div className="border-t px-4 pb-3">
                    <TaskList projectId={project.id} />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}

        {projects.length === 0 && (
          <EmptyState
            icon={FolderOpen}
            title="No projects yet"
            description="Group your time entries by project and track budgets."
            action={
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" />
                Create your first project
              </Button>
            }
          />
        )}

        {/* Filtered to nothing is a different state from having nothing, and it
            wants a different way out — clear the query, not create a project. */}
        {projects.length > 0 && visible.length === 0 && (
          <EmptyState
            icon={Search}
            title={`No projects match "${query.trim()}"`}
            description="Search looks at the project name and its client."
            action={
              <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        )}
      </div>

      {showCreate && <ProjectForm open onClose={() => setShowCreate(false)} />}
      {editProject && (
        <ProjectForm project={editProject} open onClose={() => setEditProject(null)} />
      )}
    </div>
  );
}

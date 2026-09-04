import { useState } from "react";
import { Plus, MoreHorizontal, Archive, Edit2, ChevronDown, FolderOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SpentFigure } from "@/components/ui/spent-figure";
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
import { Target } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDurationShort, formatPlainDate } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/currency";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { CollectionHeader } from "@/components/layout/CollectionHeader";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  COLLECTION_PERIODS,
  resolveCollectionPeriod,
  type CollectionPeriod,
} from "@/lib/collectionPeriod";
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
  // Defaults to all time, and says so. Clients opens on this month; the two
  // pages answer different questions, so they keep different defaults — but
  // they now use one vocabulary and neither leaves its window implicit. The
  // budget bar below stays all-time whatever this is set to.
  const [period, setPeriod] = useState<CollectionPeriod>("all");
  const range = resolveCollectionPeriod(period);
  const periodLabel =
    COLLECTION_PERIODS.find((p) => p.value === period)?.label ?? "All time";
  const { data: projects = [], isLoading } = useAllProjects(range);
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

  /**
   * Pacing is invisible until a project has a time budget, which reads as the
   * feature being broken rather than unconfigured — there is no bar, no verdict,
   * and nothing on screen saying what would produce one.
   *
   * Said ONCE above the list rather than per row: a hint on every unbudgeted
   * project would stripe the page and nag about a thing that is optional. It
   * clears itself the moment any project gets a budget, and stays hidden for a
   * workspace with nothing tracked yet, where it would be noise on top of an
   * empty state.
   */
  const anyBudgeted = projects.some((p) => p.estimatedHours);
  const anyTracked = projects.some((p) => (p.trackedSeconds ?? 0) > 0);
  const showBudgetHint = !isLoading && !anyBudgeted && anyTracked;

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
            <SegmentedControl
              label="Period"
              options={[...COLLECTION_PERIODS]}
              value={period}
              onChange={setPeriod}
            />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as ProjectSort)}>
              <SelectTrigger size="sm" className="w-36" aria-label="Sort projects">
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

      {showBudgetHint && (
        <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-dashed px-3.5 py-2.5">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-normal text-muted-foreground">
            <span className="font-medium text-foreground">No budgets set.</span> Add{" "}
            <span className="font-medium">Estimated hours</span> to a project and it
            starts reporting how fast it&apos;s burning and whether it lands over — here,
            in the assistant, and in your briefing. Hours only; no rates involved.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {visible.map((project) => {
          // budgetSeconds, not trackedSeconds: the bar is cumulative against
          // the estimate and must not follow the period control, or `11h / 40h`
          // becomes a sentence whose two halves cover different spans.
          const budgetPercent =
            project.estimatedHours && project.budgetSeconds !== undefined
              ? Math.min(
                  100,
                  Math.round(
                    (project.budgetSeconds / (project.estimatedHours * 3600)) * 100
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
              <div className="rounded-lg bg-card">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <div className="min-w-0 flex-1">
                    {/* Wrapping, with the name claiming a whole line below sm.
                        The row used to be a nowrap flex where the badges
                        couldn't shrink, so a name long enough to need two lines
                        broke *around* the badge — four of five rows on a 390px
                        screen rendered as a ragged L, with the rate outranking
                        the thing it describes. The identifier gets the line;
                        the rate is a detail and can sit beneath it. */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          "min-w-0 max-w-full basis-full truncate text-sm font-medium sm:basis-auto",
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
                        <span>
                          {formatDurationShort(project.trackedSeconds)} tracked
                          {period !== "all" && (
                            <span className="text-muted-foreground/80">
                              {" "}
                              {periodLabel.toLowerCase()}
                            </span>
                          )}
                        </span>
                      )}
                      {/* A project with time in it, but none inside the chosen
                          window, said nothing at all — indistinguishable from a
                          project nobody has ever touched. */}
                      {project.trackedSeconds === 0 && project.budgetSeconds > 0 && (
                        <span>Nothing tracked {periodLabel.toLowerCase()}</span>
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
                              aria-label={`${Math.round(budgetPercent)}% of budget used, all time`}
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
                          <TooltipContent>
                            {Math.round(budgetPercent)}% of budget used — all time
                          </TooltipContent>
                        </Tooltip>
                        <SpentFigure
                          spent={formatDurationShort(project.budgetSeconds)}
                          of={`${project.estimatedHours}h${period !== "all" ? " all time" : ""}`}
                        />
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

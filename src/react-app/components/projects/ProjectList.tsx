import { useState } from "react";
import { Plus, MoreHorizontal, Archive, Edit2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ProjectForm } from "./ProjectForm";
import { TaskList } from "./TaskList";
import { useAllProjects, useDeleteProject, useUpdateProject } from "@/hooks/useProjects";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSeconds, formatPlainDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { Project } from "@shared/schemas";

export function ProjectList() {
  const { data: projects = [], isLoading } = useAllProjects();
  const deleteProject = useDeleteProject();
  const updateProject = useUpdateProject();
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const toggleTasks = (id: string) =>
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {projects.filter((p) => p.active).length} active
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </div>

      <div className="space-y-1.5">
        {projects.map((project) => {
          const budgetPercent =
            project.estimatedHours && project.trackedSeconds !== undefined
              ? Math.min(
                  100,
                  Math.round(
                    (project.trackedSeconds / (project.estimatedHours * 3600)) * 100
                  )
                )
              : null;
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
                          Billable{project.rate ? ` $${project.rate}/h` : ""}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {project.clientName && <span>{project.clientName}</span>}
                      {project.trackedSeconds > 0 && (
                        <span>{formatSeconds(project.trackedSeconds)} tracked</span>
                      )}
                      {project.endDate && (
                        <span>Due {formatPlainDate(project.endDate)}</span>
                      )}
                    </div>
                    {/* Budget progress bar */}
                    {budgetPercent !== null && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress
                          value={budgetPercent}
                          className={cn(
                            "h-1.5 flex-1",
                            budgetPercent >= 100
                              ? "bg-destructive/20 [&>div]:bg-destructive"
                              : budgetPercent >= 80
                              ? "bg-warning/20 [&>div]:bg-warning"
                              : undefined
                          )}
                        />
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {formatSeconds(project.trackedSeconds)} / {project.estimatedHours}h
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Tasks toggle */}
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      title="Show tasks"
                    >
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </Button>
                  </CollapsibleTrigger>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
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
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No projects yet</p>
            <Button variant="link" size="sm" onClick={() => setShowCreate(true)}>
              Create your first project
            </Button>
          </div>
        )}
      </div>

      {showCreate && <ProjectForm open onClose={() => setShowCreate(false)} />}
      {editProject && (
        <ProjectForm project={editProject} open onClose={() => setEditProject(null)} />
      )}
    </div>
  );
}

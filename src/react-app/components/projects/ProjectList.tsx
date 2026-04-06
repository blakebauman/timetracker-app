import { useState } from "react";
import { Plus, MoreHorizontal, Archive, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectForm } from "./ProjectForm";
import { useAllProjects, useDeleteProject } from "@/hooks/useProjects";
import { Skeleton } from "@/components/ui/skeleton";
import type { Project } from "@shared/schemas";

export function ProjectList() {
  const { data: projects = [], isLoading } = useAllProjects();
  const deleteProject = useDeleteProject();
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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
        {projects.map((project) => (
          <div
            key={project.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${!project.active ? "text-muted-foreground line-through" : ""}`}>
                  {project.name}
                </span>
                {!project.active && (
                  <Badge variant="outline" className="text-xs">
                    Archived
                  </Badge>
                )}
                {project.billable && (
                  <Badge variant="secondary" className="text-xs">
                    Billable{project.rate ? ` $${project.rate}/h` : ""}
                  </Badge>
                )}
              </div>
              {project.clientName && (
                <p className="text-xs text-muted-foreground">
                  {project.clientName}
                </p>
              )}
            </div>

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
                  onClick={() => deleteProject.mutate(project.id)}
                >
                  <Archive className="mr-2 h-3.5 w-3.5" />
                  {project.active ? "Archive" : "Unarchive"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}

        {projects.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No projects yet</p>
            <Button
              variant="link"
              size="sm"
              onClick={() => setShowCreate(true)}
            >
              Create your first project
            </Button>
          </div>
        )}
      </div>

      {showCreate && (
        <ProjectForm open onClose={() => setShowCreate(false)} />
      )}
      {editProject && (
        <ProjectForm
          project={editProject}
          open
          onClose={() => setEditProject(null)}
        />
      )}
    </div>
  );
}

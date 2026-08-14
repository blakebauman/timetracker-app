import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Edit2,
  Mail,
  Phone,
  MapPin,
  ChevronDown,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ClientForm } from "@/components/clients/ClientForm";
import { TaskList } from "@/components/projects/TaskList";
import { useClient, useAllProjects } from "@/hooks/useProjects";
import { formatDurationShort } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading, isError } = useClient(id);
  const { data: allProjects = [] } = useAllProjects();
  const [showEdit, setShowEdit] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (projectId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (isError || !client) {
    return (
      <div className="p-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 gap-1.5"
          onClick={() => navigate("/clients")}
        >
          <ArrowLeft className="h-4 w-4" />
          Clients
        </Button>
        <EmptyState
          icon={FolderOpen}
          title="Client not found"
          description="This client may have been deleted."
        />
      </div>
    );
  }

  const projects = allProjects.filter((p) => p.clientId === client.id);
  const totalTracked = projects.reduce((sum, p) => sum + (p.trackedSeconds ?? 0), 0);

  return (
    <div className="p-6">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 gap-1.5 text-muted-foreground"
        onClick={() => navigate("/clients")}
      >
        <ArrowLeft className="h-4 w-4" />
        Clients
      </Button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{client.name}</h1>
            {client.archived && (
              <Badge variant="outline" className="text-xs">Archived</Badge>
            )}
          </div>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            {client.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" />
                <a href={`mailto:${client.email}`} className="hover:underline">
                  {client.email}
                </a>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" />
                <a href={`tel:${client.phone}`} className="hover:underline">
                  {client.phone}
                </a>
              </div>
            )}
            {client.address && (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-pre-line">{client.address}</span>
              </div>
            )}
          </div>
          {client.notes && (
            <p className="mt-3 max-w-prose whitespace-pre-line rounded-md bg-muted/50 p-3 text-sm">
              {client.notes}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowEdit(true)}>
          <Edit2 className="h-3.5 w-3.5" />
          Edit
        </Button>
      </div>

      {/* Projects */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </h2>
        {totalTracked > 0 && (
          <span className="text-xs text-muted-foreground">
            {formatDurationShort(totalTracked)} tracked total
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {projects.map((project) => {
          const isExpanded = expanded.has(project.id);
          return (
            <Collapsible
              key={project.id}
              open={isExpanded}
              onOpenChange={() => toggle(project.id)}
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
                    </div>
                    {project.trackedSeconds > 0 && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatDurationShort(project.trackedSeconds)} tracked
                      </div>
                    )}
                  </div>

                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground"
                      title="Show tasks"
                    >
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform duration-fast ease-out-quart",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </Button>
                  </CollapsibleTrigger>
                </div>

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
            title="No projects for this client"
            description="Assign a project to this client from the Projects page."
          />
        )}
      </div>

      {showEdit && (
        <ClientForm client={client} open onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Edit2,
  Mail,
  Phone,
  MapPin,
  ChevronDown,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Pane,
  PaneActions,
  PaneHeader,
  PaneScroll,
  PaneTitle,
} from "@/components/layout/Pane";
import { useClientStats } from "@/hooks/useClientStats";
import {
  COLLECTION_PERIODS,
  resolveCollectionPeriod,
  type CollectionPeriod,
} from "@/lib/collectionPeriod";
import { formatCurrency } from "@/lib/currency";
import { useUIStore } from "@/stores/uiStore";
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
  // Same period vocabulary and the same aggregation as the Clients list, so
  // the drill-down continues the sentence the row started instead of
  // restating it in different units.
  const [period, setPeriod] = useState<CollectionPeriod>("thisMonth");
  const { since, until } = resolveCollectionPeriod(period);
  const { byClient, isLoading: statsLoading } = useClientStats(since, until);
  const currency = useUIStore((s) => s.currency);
  const stats = id ? byClient.get(id) : undefined;

  const toggle = (projectId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });

  // The way back, in the header of every state — loading, missing, found — so
  // it never moves and is never absent.
  const backLink = (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 gap-1.5 text-muted-foreground"
      onClick={() => navigate("/clients")}
    >
      <ChevronLeft className="h-4 w-4" />
      Clients
    </Button>
  );

  if (isLoading) {
    return (
      <Pane>
        <PaneHeader>
          {backLink}
          <Skeleton className="h-8 w-48" />
        </PaneHeader>
        <PaneScroll className="space-y-4">
          <Skeleton className="h-24 w-full rounded-container" />
          <Skeleton className="h-14 w-full rounded-container" />
          <Skeleton className="h-14 w-full rounded-container" />
        </PaneScroll>
      </Pane>
    );
  }

  if (isError || !client) {
    return (
      <Pane>
        <PaneHeader>{backLink}</PaneHeader>
        <PaneScroll>
          <EmptyState
            icon={FolderOpen}
            title="Client not found"
            description="This client may have been deleted."
          />
        </PaneScroll>
      </Pane>
    );
  }

  const projects = allProjects.filter((p) => p.clientId === client.id);
  const totalTracked = projects.reduce((sum, p) => sum + (p.trackedSeconds ?? 0), 0);
  const hasContact = Boolean(client.email || client.phone || client.address || client.notes);

  return (
    <Pane>
      <PaneHeader>
        {backLink}
        <PaneTitle
          subtitle={
            client.archived ? (
              <Badge variant="outline" className="text-xs">Archived</Badge>
            ) : undefined
          }
        >
          {client.name}
        </PaneTitle>
        <PaneActions>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowEdit(true)}>
            <Edit2 className="h-3.5 w-3.5" />
            Edit
          </Button>
        </PaneActions>
      </PaneHeader>

      <PaneScroll>
        {/* Contact details, as one panel. Only rendered when there is something
            to show — an empty bordered card under the title is a question the
            page can't answer. */}
        {hasContact && (
          <Card className="mb-6 gap-0 py-4">
            <CardContent className="px-4">
              <div className="space-y-1 text-sm text-muted-foreground">
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
                <p
                  className={cn(
                    "max-w-prose whitespace-pre-line rounded-md bg-background p-3 text-sm",
                    (client.email || client.phone || client.address) && "mt-3"
                  )}
                >
                  {client.notes}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* The same four figures the list row shows, in the framed strip the
            reports summary already uses — one internal-divider strip rather than
            a grid of little cards, so a missing metric can't orphan a cell. */}
        <div className="mb-6 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Activity</h2>
            <SegmentedControl
              label="Period"
              options={[...COLLECTION_PERIODS]}
              value={period}
              onChange={setPeriod}
            />
          </div>
          {statsLoading ? (
            <Skeleton className="h-20 w-full rounded-container" />
          ) : (
            <div className="flex animate-fade-up flex-wrap gap-px overflow-hidden rounded-container border bg-border">
              {[
                { label: "Projects", value: String(stats?.projectCount ?? 0) },
                { label: "Tracked", value: formatDurationShort(stats?.totalSeconds ?? 0) },
                { label: "Billable", value: formatDurationShort(stats?.billableSeconds ?? 0) },
                {
                  label: "Billable amount",
                  value: formatCurrency(stats?.billableAmount ?? 0, currency),
                  accent: true,
                },
              ].map((m) => (
                <div key={m.label} className="min-w-37.5 flex-1 bg-card p-4">
                  <div className="text-xs font-medium text-muted-foreground">{m.label}</div>
                  <p
                    className={cn(
                      "mt-1.5 text-xl font-semibold tabular-nums tracking-tight",
                      m.accent && "text-success-ink"
                    )}
                  >
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
          )}
          {!statsLoading && !stats && (
            <p className="text-xs text-muted-foreground">
              No time tracked for this client in this period.
            </p>
          )}
        </div>

        {/* Projects */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </h2>
          {totalTracked > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatDurationShort(totalTracked)} tracked all time
            </span>
          )}
        </div>

        <div className="space-y-2">
          {projects.map((project) => {
            const isExpanded = expanded.has(project.id);
            return (
              <Collapsible
                key={project.id}
                open={isExpanded}
                onOpenChange={() => toggle(project.id)}
              >
                <div className="rounded-container border bg-card">
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
                          {formatDurationShort(project.trackedSeconds)} all time
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
      </PaneScroll>

      {showEdit && (
        <ClientForm client={client} open onClose={() => setShowEdit(false)} />
      )}
    </Pane>
  );
}

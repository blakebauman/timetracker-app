import { useState } from "react";
import { Plus, Pencil, Trash2, Plug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { IntegrationForm } from "./IntegrationForm";
import { useIntegrations, useDeleteIntegration } from "@/hooks/useIntegrations";
import type { Integration, IntegrationType } from "@timetracker/core/schemas";

const TYPE_LABELS: Record<IntegrationType, string> = {
  workfront: "Workfront",
  dynamics: "Dynamics 365",
};

export function IntegrationsCard() {
  const { data: integrations = [], isLoading } = useIntegrations();
  const deleteIntegration = useDeleteIntegration();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Integration | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Integration | null>(null);

  const openNew = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (integration: Integration) => {
    setEditing(integration);
    setFormOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Integrations</CardTitle>
        {/* Same rule as Planner/Timesheet/Tasks/Clients: while the body is
            empty, the empty state owns the action. */}
        {integrations.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Add integration
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Connect Adobe Workfront or Microsoft Dynamics 365 to push time entries.
          Assign a connection to a project from the project settings.
        </p>

        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : integrations.length === 0 ? (
          <EmptyState
            icon={Plug}
            title="No integrations yet"
            description="Connect one to push tracked time straight into your client's system."
            action={
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Add integration
              </Button>
            }
            className="rounded-container border border-dashed py-8"
          />
        ) : (
          <div className="space-y-2">
            {integrations.map((integration) => (
              <SettingsRow
                key={integration.id}
                label={
                  <>
                    <span className="truncate">{integration.name}</span>
                    <Badge variant="outline" className="text-micro">
                      {TYPE_LABELS[integration.type]}
                    </Badge>
                  </>
                }
                description={integration.baseUrl}
                trailing={
                  <>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => openEdit(integration)}
                      aria-label={`Edit ${integration.name}`}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(integration)}
                      disabled={deleteIntegration.isPending}
                      aria-label={`Remove ${integration.name}`}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </CardContent>

      {formOpen && (
        <IntegrationForm
          integration={editing}
          open={formOpen}
          onClose={() => setFormOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove integration?"
        description={`"${deleteTarget?.name}" will be disconnected. Projects using it will stop pushing time entries.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (deleteTarget) deleteIntegration.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </Card>
  );
}

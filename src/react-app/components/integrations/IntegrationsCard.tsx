import { useState } from "react";
import { Plus, Pencil, Trash2, Plug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IntegrationForm } from "./IntegrationForm";
import { useIntegrations, useDeleteIntegration } from "@/hooks/useIntegrations";
import type { Integration, IntegrationType } from "@shared/schemas";

const TYPE_LABELS: Record<IntegrationType, string> = {
  workfront: "Workfront",
  dynamics: "Dynamics 365",
};

export function IntegrationsCard() {
  const { data: integrations = [] } = useIntegrations();
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
        <Button variant="outline" size="sm" className="gap-1.5" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Add integration
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Connect Adobe Workfront or Microsoft Dynamics 365 to push time entries.
          Assign a connection to a project from the project settings.
        </p>

        {integrations.length === 0 ? (
          <EmptyState
            icon={Plug}
            title="No integrations yet"
            className="rounded-md border border-dashed py-8"
          />
        ) : (
          <ul className="divide-y rounded-md border">
            {integrations.map((integration) => (
              <li
                key={integration.id}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{integration.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {TYPE_LABELS[integration.type]}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{integration.baseUrl}</p>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => openEdit(integration)}
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(integration)}
                  disabled={deleteIntegration.isPending}
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
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

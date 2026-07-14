import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ClientForm } from "./ClientForm";
import { useClients } from "@/hooks/useProjects";
import { Skeleton } from "@/components/ui/skeleton";

export function ClientList() {
  const { data: clients = [], isLoading } = useClients();
  const [showCreate, setShowCreate] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Clients</h1>
          <p className="text-sm text-muted-foreground">
            {clients.length} client{clients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New client
        </Button>
      </div>

      <div className="space-y-1.5">
        {clients.map((client) => (
          <div
            key={client.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{client.name}</span>
            {client.archived && (
              <Badge variant="outline" className="text-xs">
                Archived
              </Badge>
            )}
          </div>
        ))}

        {clients.length === 0 && (
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Group projects under clients to organize your work."
            action={
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add your first client
              </Button>
            }
          />
        )}
      </div>

      {showCreate && <ClientForm open onClose={() => setShowCreate(false)} />}
    </div>
  );
}

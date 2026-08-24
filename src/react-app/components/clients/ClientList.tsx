import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users, MoreHorizontal, Archive, Edit2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientForm } from "./ClientForm";
import { useAllClients, useDeleteClient, useUpdateClient } from "@/hooks/useProjects";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Client } from "@shared/schemas";

export function ClientList() {
  const { data: clients = [], isLoading } = useAllClients();
  const deleteClient = useDeleteClient();
  const updateClient = useUpdateClient();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);

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
        {clients.length > 0 && (
          <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New client
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        {clients.map((client) => (
          <div
            key={client.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <button
              type="button"
              onClick={() => navigate(`/clients/${client.id}`)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span
                className={cn(
                  "truncate text-sm font-medium",
                  client.archived && "text-muted-foreground line-through"
                )}
              >
                {client.name}
              </span>
              {client.archived && (
                <Badge variant="outline" className="text-xs">Archived</Badge>
              )}
              {client.email && (
                <span className="truncate text-xs text-muted-foreground">
                  {client.email}
                </span>
              )}
            </button>

            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Client actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditClient(client)}>
                  <Edit2 className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    client.archived
                      ? updateClient.mutate({ id: client.id, data: { archived: false } })
                      : deleteClient.mutate(client.id)
                  }
                >
                  <Archive className="mr-2 h-3.5 w-3.5" />
                  {client.archived ? "Unarchive" : "Archive"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
      {editClient && (
        <ClientForm client={editClient} open onClose={() => setEditClient(null)} />
      )}
    </div>
  );
}

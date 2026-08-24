import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users, MoreHorizontal, Archive, Edit2, ChevronRight } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useClientStats } from "@/hooks/useClientStats";
import {
  CLIENT_PERIODS,
  resolveClientPeriod,
  type ClientPeriod,
} from "@/lib/clientPeriod";
import { formatDurationShort } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/currency";
import { useUIStore } from "@/stores/uiStore";
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
import type { Client, ClientStats } from "@shared/schemas";

/**
 * The four figures, as fixed-width right-aligned columns on desktop and a
 * labelled wrap-around strip below md.
 *
 * A client with no tracked time in the window renders dashes rather than
 * zeroes: "0h / $0.00" reads as a broken integration, "–" reads as "nothing
 * this month", which is the truth and is often fine.
 */
function ClientFigures({
  stats,
  loading,
  currency,
}: {
  stats: ClientStats | undefined;
  loading: boolean;
  currency: string;
}) {
  if (loading) {
    return (
      <div className="flex shrink-0 items-center gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  const cell = (
    label: string,
    value: string,
    width: string,
    opts?: { strong?: boolean; muted?: boolean }
  ) => (
    <span className={cn("flex shrink-0 items-baseline gap-1.5 md:block", width)}>
      <span className="text-micro text-muted-foreground md:hidden">{label}</span>
      <span
        className={cn(
          "tabular-nums md:block md:text-right",
          opts?.strong ? "text-sm font-semibold" : "text-sm",
          opts?.muted && "text-muted-foreground"
        )}
      >
        {value}
      </span>
    </span>
  );

  if (!stats) {
    return (
      <div className="order-last flex w-full flex-wrap items-center gap-x-4 gap-y-1 md:order-none md:w-auto md:flex-nowrap md:gap-x-3">
        {cell("Projects", "–", "md:w-16", { muted: true })}
        {cell("Tracked", "–", "md:w-20", { muted: true })}
        {cell("Billable", "–", "md:w-20", { muted: true })}
        {cell("Amount", "–", "md:w-24", { muted: true })}
      </div>
    );
  }

  return (
    <div className="order-last flex w-full flex-wrap items-center gap-x-4 gap-y-1 md:order-none md:w-auto md:flex-nowrap md:gap-x-3">
      {cell("Projects", String(stats.projectCount), "md:w-16", { muted: true })}
      {cell("Tracked", formatDurationShort(stats.totalSeconds), "md:w-20")}
      {cell("Billable", formatDurationShort(stats.billableSeconds), "md:w-20")}
      <span className="flex shrink-0 items-baseline gap-1.5 md:block md:w-24">
        <span className="text-micro text-muted-foreground md:hidden">Amount</span>
        {/* The headline figure: the one number a consultant is actually here
            for, so it gets the weight and the semantic colour that means
            "billable" everywhere else in the app. */}
        <span className="text-sm font-semibold tabular-nums text-success-ink md:block md:text-right">
          {formatCurrency(stats.billableAmount, currency)}
        </span>
      </span>
    </div>
  );
}

export function ClientList() {
  const { data: clients = [], isLoading } = useAllClients();
  const [period, setPeriod] = useState<ClientPeriod>("thisMonth");
  const { since, until } = resolveClientPeriod(period);
  const { byClient, isLoading: statsLoading } = useClientStats(since, until);
  const currency = useUIStore((s) => s.currency);
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Clients</h1>
        <div className="flex flex-wrap items-center gap-2">
          {clients.length > 0 && (
            <SegmentedControl
              label="Period"
              options={[...CLIENT_PERIODS]}
              value={period}
              onChange={setPeriod}
            />
          )}
          {clients.length > 0 && (
            <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              New client
            </Button>
          )}
        </div>
      </div>

      {/* Column headings for the numeric columns. A client list is a comparison
          table — the whole point is reading down a column — so the numbers get
          named once at the top rather than repeating a label in every row.
          Hidden below md, where the row reflows and each figure carries its own
          label instead. */}
      {clients.length > 0 && (
        <div className="mb-1 hidden items-center gap-3 px-4 text-micro font-medium text-muted-foreground md:flex">
          <span className="min-w-0 flex-1">Client</span>
          <span className="w-16 shrink-0 text-right">Projects</span>
          <span className="w-20 shrink-0 text-right">Tracked</span>
          <span className="w-20 shrink-0 text-right">Billable</span>
          <span className="w-24 shrink-0 text-right">Amount</span>
          <span className="w-8 shrink-0" aria-hidden />
          <span className="w-8 shrink-0" aria-hidden />
        </div>
      )}

      <div className="space-y-1.5">
        {clients.map((client) => (
          <div
            key={client.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3 md:flex-nowrap"
          >
            <button
              type="button"
              onClick={() => navigate(`/clients/${client.id}`)}
              // `min-w-0` matters: without it this collapsed to 16px at 390 and
              // hid the client's name rather than truncating it. It shares line
              // one with the row menu; the figures below take a full line of
              // their own, which is what leaves room for both.
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    client.archived && "text-muted-foreground line-through"
                  )}
                >
                  {client.name}
                </span>
                {client.email && (
                  <span className="truncate text-xs text-muted-foreground">
                    {client.email}
                  </span>
                )}
              </span>
              {client.archived && (
                <Badge variant="outline" className="shrink-0 text-xs">Archived</Badge>
              )}
            </button>

            {/* The numbers. Fixed-width right-aligned columns with tabular
                figures so they scan vertically — the Tabular Rule exists for
                exactly this, and a client list is read down a column, not
                across a row. Each carries its own label below md, where the
                columns stack and the shared heading row is hidden. */}
            <ClientFigures
              stats={byClient.get(client.id)}
              loading={statsLoading}
              currency={currency}
            />

            <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />

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

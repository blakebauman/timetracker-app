import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDurationShort, formatShortDate, formatEntryTime } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/currency";
import { useUIStore } from "@/stores/uiStore";
import {
  useUpdateEntry,
  useDeleteEntry,
  useCreateEntry,
  useBulkUpdateEntries,
  useBulkDeleteEntries,
} from "@/hooks/useEntries";
import { EntryForm } from "@/components/entries/EntryForm";
import { ColorDot } from "@/components/ColorDot";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Columns3,
  MoreHorizontal,
  Pencil,
  Copy,
  DollarSign,
  Trash2,
  X,
  Inbox,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export interface DetailedEntry {
  id: string;
  description: string;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  clientName: string | null;
  taskId: string | null;
  taskName: string | null;
  start: string;
  stop: string | null;
  duration: number | null;
  billable: boolean;
  amount: number;
  tags: string[];
}

type ColumnKey =
  | "description"
  | "client"
  | "project"
  | "task"
  | "date"
  | "time"
  | "amount"
  | "duration";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
  align?: "right";
  sortValue: (e: DetailedEntry) => string | number;
}

const COLUMNS: ColumnDef[] = [
  { key: "description", label: "Description", defaultVisible: true, sortValue: (e) => e.description.toLowerCase() },
  { key: "client", label: "Client", defaultVisible: false, sortValue: (e) => (e.clientName ?? "").toLowerCase() },
  { key: "project", label: "Project", defaultVisible: true, sortValue: (e) => (e.projectName ?? "").toLowerCase() },
  { key: "task", label: "Task", defaultVisible: false, sortValue: (e) => (e.taskName ?? "").toLowerCase() },
  { key: "date", label: "Date", defaultVisible: true, sortValue: (e) => e.start },
  { key: "time", label: "Time", defaultVisible: true, sortValue: (e) => e.start },
  { key: "amount", label: "Amount", defaultVisible: true, align: "right", sortValue: (e) => e.amount },
  { key: "duration", label: "Duration", defaultVisible: true, align: "right", sortValue: (e) => e.duration ?? 0 },
];

const STORAGE_KEY = "reports_detailed_columns";

function loadVisible(): Record<ColumnKey, boolean> {
  const defaults = Object.fromEntries(
    COLUMNS.map((c) => [c.key, c.defaultVisible])
  ) as Record<ColumnKey, boolean>;
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

interface DetailedTableProps {
  entries: DetailedEntry[];
}

export function DetailedTable({ entries }: DetailedTableProps) {
  const timeFormat = useUIStore((s) => s.timeFormat);
  const currency = useUIStore((s) => s.currency);
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>(loadVisible);
  const [sort, setSort] = useState<{ key: ColumnKey; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<DetailedEntry | null>(null);

  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();
  const createEntry = useCreateEntry();
  const bulkUpdate = useBulkUpdateEntries();
  const bulkDelete = useBulkDeleteEntries();

  const toggleColumn = (key: ColumnKey) =>
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });

  const setSortKey = (key: ColumnKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "date" || key === "amount" || key === "duration" ? "desc" : "asc" }
    );

  const cols = COLUMNS.filter((c) => visible[c.key]);

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key)!;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...entries].sort((a, b) => {
      const av = col.sortValue(a);
      const bv = col.sortValue(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [entries, sort]);

  const clearSelection = () => setSelected(new Set());
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = sorted.length > 0 && selected.size === sorted.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(sorted.map((e) => e.id)));

  const duplicate = (e: DetailedEntry) =>
    createEntry.mutate({
      description: e.description,
      projectId: e.projectId,
      taskId: e.taskId,
      start: e.start,
      stop: e.stop,
      billable: e.billable,
      tags: e.tags,
    });

  const bulkBillable = (billable: boolean) =>
    bulkUpdate.mutate(
      { ids: [...selected], patch: { billable } },
      { onSuccess: clearSelection }
    );
  const bulkRemove = () =>
    bulkDelete.mutate([...selected], { onSuccess: clearSelection });

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No entries for this period"
        description="Try widening the date range or adjusting your filters."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar: bulk action bar when rows are selected, else column menu */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 print:hidden">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8" onClick={() => bulkBillable(true)}>
              Billable
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => bulkBillable(false)}>
              Non-billable
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-destructive" onClick={bulkRemove}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={clearSelection} aria-label="Clear selection">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end print:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-sm">
                <Columns3 className="h-3.5 w-3.5" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={visible[c.key]}
                  onCheckedChange={() => toggleColumn(c.key)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-8 print:hidden">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-3.5 accent-primary"
                />
              </TableHead>
              {cols.map((c) => (
                <TableHead key={c.key} className={cn("text-xs", c.align === "right" && "text-right")}>
                  <button
                    type="button"
                    onClick={() => setSortKey(c.key)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-foreground",
                      c.align === "right" && "flex-row-reverse"
                    )}
                  >
                    {c.label}
                    {sort.key === c.key &&
                      (sort.dir === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      ))}
                  </button>
                </TableHead>
              ))}
              <TableHead className="w-8 print:hidden" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((entry) => (
              <TableRow key={entry.id} data-state={selected.has(entry.id) ? "selected" : undefined}>
                <TableCell className="print:hidden">
                  <input
                    type="checkbox"
                    aria-label={`Select ${entry.description || "entry"}`}
                    checked={selected.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                    className="size-3.5 accent-primary"
                  />
                </TableCell>
                {cols.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      "py-2.5",
                      c.align === "right" && "text-right font-mono text-xs tabular-nums",
                      (c.key === "date" || c.key === "time") && "text-xs text-muted-foreground",
                      c.key === "amount" && "text-muted-foreground"
                    )}
                  >
                    {renderCell(c.key, entry, timeFormat, currency)}
                  </TableCell>
                ))}
                <TableCell className="py-2.5 print:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(entry)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicate(entry)}>
                        <Copy className="h-3.5 w-3.5" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          updateEntry.mutate({ id: entry.id, data: { billable: !entry.billable } })
                        }
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        {entry.billable ? "Mark non-billable" : "Mark billable"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => deleteEntry.mutate(entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t bg-muted/20 px-4 py-2 text-right text-xs text-muted-foreground">
          {entries.length} entr{entries.length !== 1 ? "ies" : "y"}
        </div>
      </div>

      {editing && (
        <EntryForm entry={editing} open onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function renderCell(
  key: ColumnKey,
  entry: DetailedEntry,
  timeFormat: "24h" | "12h",
  currency: string
) {
  switch (key) {
    case "description":
      return (
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {entry.description || (
              <span className="italic text-muted-foreground">No description</span>
            )}
          </span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {entry.billable && (
              <span className="text-[10px] font-semibold text-primary">$</span>
            )}
            {entry.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="h-4 px-1 py-0 text-[10px] font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      );
    case "client":
      return entry.clientName ? (
        <span className="truncate text-xs">{entry.clientName}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      );
    case "project":
      return entry.projectName ? (
        <div className="flex items-center gap-1.5">
          <ColorDot color={entry.projectColor} className="h-2 w-2" />
          <span className="truncate text-xs">{entry.projectName}</span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      );
    case "task":
      return entry.taskName ? (
        <span className="truncate text-xs">{entry.taskName}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      );
    case "date":
      return formatShortDate(entry.start);
    case "time":
      return (
        <>
          {formatEntryTime(entry.start, timeFormat)}
          {entry.stop && <> – {formatEntryTime(entry.stop, timeFormat)}</>}
        </>
      );
    case "amount":
      return entry.amount ? formatCurrency(entry.amount, currency) : "–";
    case "duration":
      return entry.duration ? formatDurationShort(entry.duration) : "–";
  }
}

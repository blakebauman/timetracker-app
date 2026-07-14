import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
import { formatSeconds, formatShortDate, formatEntryTime } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/currency";
import { useUIStore } from "@/stores/uiStore";
import { ColorDot } from "@/components/ColorDot";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Columns3 } from "lucide-react";

export interface DetailedEntry {
  id: string;
  description: string;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  clientName: string | null;
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
  // Value used for sorting (string sorts case-insensitively, number numerically).
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
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...defaults, ...saved };
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

  const toggleColumn = (key: ColumnKey) => {
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

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

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No entries for this period
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Column visibility */}
      <div className="flex justify-end">
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

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {cols.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn("text-xs", c.align === "right" && "text-right")}
                >
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((entry) => (
              <TableRow key={entry.id}>
                {cols.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      "py-2.5",
                      c.align === "right" &&
                        "text-right font-mono text-xs tabular-nums",
                      (c.key === "date" || c.key === "time") &&
                        "text-xs text-muted-foreground",
                      c.key === "amount" && "text-muted-foreground"
                    )}
                  >
                    {renderCell(c.key, entry, timeFormat, currency)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t bg-muted/20 px-4 py-2 text-right text-xs text-muted-foreground">
          {entries.length} entr{entries.length !== 1 ? "ies" : "y"}
        </div>
      </div>
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
              <Badge
                key={tag}
                variant="outline"
                className="h-4 px-1 py-0 text-[10px] font-normal"
              >
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
      return entry.duration ? formatSeconds(entry.duration) : "–";
  }
}

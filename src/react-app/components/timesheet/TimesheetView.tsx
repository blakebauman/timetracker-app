import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { Plus, Copy, Loader2, AlertTriangle, Table2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorDot } from "@/components/ColorDot";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useEntriesRange,
  useCreateEntry,
  useUpdateEntry,
  useDeleteEntry,
} from "@/hooks/useEntries";
import { api } from "@/lib/api";
import {
  formatDurationShort,
  formatTimeInput,
  parseTimeInput,
} from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { AddTimesheetRowDialog } from "./AddTimesheetRowDialog";
import type { TimeEntry } from "@shared/schemas";

interface TimesheetViewProps {
  weekStart: Date; // Monday
}

interface RowMeta {
  key: string;
  projectId: string | null;
  taskId: string | null;
  projectName: string | null;
  projectColor: string | null;
  taskName: string | null;
}

interface Cell {
  seconds: number;
  entries: TimeEntry[];
}

const rowKeyOf = (projectId: string | null, taskId: string | null) =>
  `${projectId ?? ""}__${taskId ?? ""}`;

const DEFAULT_START_HOUR = 9; // where a freshly-typed cell entry begins

// A weekly timesheet grid: project/task rows × day columns. Typing a duration
// into a cell creates/updates/deletes the underlying time entry for that
// project+task on that day. Cells backed by more than one entry are read-only
// (ambiguous to edit) — edit those in the list or calendar view.
export function TimesheetView({ weekStart }: TimesheetViewProps) {
  const queryClient = useQueryClient();
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  const {
    data: entries = [],
    isLoading,
    // Previously undestructured — a failed fetch rendered as an ordinary empty
    // grid, indistinguishable from a week with nothing tracked.
    isError,
    refetch,
  } = useEntriesRange(weekStart.toISOString(), weekEnd.toISOString());

  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();

  // Manually-added empty rows (project/task combos with no entries yet).
  const [extraRows, setExtraRows] = useState<RowMeta[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [editing, setEditing] = useState<{ row: string; day: number } | null>(null);
  const [draft, setDraft] = useState("");

  // Build rows + a rowKey→dayIndex→Cell lookup from the week's entries.
  const { rows, cells } = useMemo(() => {
    const rowMap = new Map<string, RowMeta>();
    const cellMap = new Map<string, Cell[]>();

    const ensureRow = (m: RowMeta) => {
      if (!rowMap.has(m.key)) {
        rowMap.set(m.key, m);
        cellMap.set(
          m.key,
          Array.from({ length: 7 }, () => ({ seconds: 0, entries: [] }))
        );
      }
    };

    for (const e of entries) {
      const key = rowKeyOf(e.projectId, e.taskId);
      ensureRow({
        key,
        projectId: e.projectId,
        taskId: e.taskId,
        projectName: e.projectName,
        projectColor: e.projectColor,
        taskName: e.taskName ?? null,
      });
      // Day index from the entry's local start date.
      const start = new Date(e.start);
      const dayIndex = Math.floor(
        (new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() -
          new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).getTime()) /
          86_400_000
      );
      if (dayIndex < 0 || dayIndex > 6) continue;
      const cell = cellMap.get(key)![dayIndex];
      cell.seconds += e.duration ?? 0;
      cell.entries.push(e);
    }

    // Include manually-added empty rows.
    for (const r of extraRows) ensureRow(r);

    const rowsArr = [...rowMap.values()].sort((a, b) => {
      const pa = a.projectName ?? "￿";
      const pb = b.projectName ?? "￿";
      return pa.localeCompare(pb) || (a.taskName ?? "").localeCompare(b.taskName ?? "");
    });
    return { rows: rowsArr, cells: cellMap };
  }, [entries, extraRows, weekStart]);

  const dayTotals = useMemo(() => {
    const totals = Array(7).fill(0);
    for (const list of cells.values()) list.forEach((c, i) => (totals[i] += c.seconds));
    return totals;
  }, [cells]);
  const grandTotal = dayTotals.reduce((s, n) => s + n, 0);

  const commitCell = (row: RowMeta, dayIndex: number) => {
    const cell = cells.get(row.key)![dayIndex];
    setEditing(null);
    const parsed = parseTimeInput(draft.trim());
    // Invalid input → ignore. Empty or 0 → clear (delete single entry).
    const seconds = draft.trim() === "" ? 0 : parsed;
    if (seconds === null) return;
    if (cell.entries.length > 1) return; // read-only aggregate

    if (cell.entries.length === 1) {
      const entry = cell.entries[0];
      if (seconds <= 0) {
        deleteEntry.mutate(entry.id);
      } else {
        const start = new Date(entry.start);
        const stop = new Date(start.getTime() + seconds * 1000);
        updateEntry.mutate({ id: entry.id, data: { stop: stop.toISOString() } });
      }
      return;
    }

    // No entry yet → create one starting at the default hour on that day.
    if (seconds > 0) {
      const day = days[dayIndex];
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DEFAULT_START_HOUR, 0, 0);
      const stop = new Date(start.getTime() + seconds * 1000);
      createEntry.mutate({
        description: "",
        projectId: row.projectId,
        taskId: row.taskId,
        start: start.toISOString(),
        stop: stop.toISOString(),
        billable: false,
        tags: [],
      });
    }
  };

  const handleCopyLastWeek = async () => {
    setCopying(true);
    try {
      const prevStart = addDays(weekStart, -7);
      const prev = (await api.timeEntries.list({
        since: prevStart.toISOString(),
        until: weekStart.toISOString(),
      })) as TimeEntry[];
      const completed = prev.filter((e) => e.stop && e.duration && e.duration > 0);
      if (completed.length === 0) {
        toast.info("No entries to copy from last week");
        return;
      }
      await Promise.all(
        completed.map((e) =>
          api.timeEntries.create({
            description: e.description,
            projectId: e.projectId,
            taskId: e.taskId,
            start: addDays(new Date(e.start), 7).toISOString(),
            stop: addDays(new Date(e.stop!), 7).toISOString(),
            billable: e.billable,
            tags: e.tags ?? [],
          } as unknown as Record<string, unknown>)
        )
      );
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success(`Copied ${completed.length} ${completed.length === 1 ? "entry" : "entries"} from last week`);
    } catch {
      toast.error("Couldn't copy last week");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* min-w forces a horizontal scroller instead of letting seven day columns
          squeeze below legibility; the Task/Project pair stays pinned so a
          narrow screen never loses track of which row it's scrolling. */}
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="sticky top-0 z-20 bg-background">
          <tr className="border-b text-xs text-muted-foreground">
            <th className="sticky left-0 z-10 w-[132px] min-w-[132px] bg-background px-3 py-2 text-left font-medium">
              Task
            </th>
            <th className="sticky left-[132px] z-10 w-[148px] min-w-[148px] border-r border-border-strong bg-background px-3 py-2 text-left font-medium">
              Project
            </th>
            {days.map((d, i) => (
              <th key={i} className="px-2 py-2 text-center font-medium">
                <div className="uppercase">{format(d, "EEE")}</div>
                {/* Full-strength muted: the old /70 opacity measured 4.26:1 in dark. */}
                <div className="text-[11px] text-muted-foreground">{format(d, "MMM d")}</div>
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={10} className="py-16 text-center text-muted-foreground">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td>
            </tr>
          ) : isError ? (
            <tr>
              <td colSpan={10} className="py-10">
                <EmptyState
                  icon={AlertTriangle}
                  title="Couldn't load this week"
                  description="The request didn't get through. Your tracked time is safe."
                  action={
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                      Try again
                    </Button>
                  }
                  className="py-0"
                />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={10} className="py-10">
                <EmptyState
                  icon={Table2}
                  title="Nothing tracked this week"
                  description="Add a row to fill in hours by project and task, or copy last week's rows as a starting point."
                  action={
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                        Add row
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyLastWeek}
                        disabled={copying}
                      >
                        Copy last week
                      </Button>
                    </div>
                  }
                  className="py-0"
                />
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const rowCells = cells.get(row.key)!;
              const rowTotal = rowCells.reduce((s, c) => s + c.seconds, 0);
              return (
                <tr
                  key={row.key}
                  className="group/row border-b border-border-strong hover:bg-muted/30"
                >
                  <td className="sticky left-0 z-10 w-[132px] min-w-[132px] bg-background px-3 py-2 group-hover/row:bg-muted/30">
                    {row.taskName ?? <span className="italic text-muted-foreground">No task</span>}
                  </td>
                  <td className="sticky left-[132px] z-10 w-[148px] min-w-[148px] border-r border-border-strong bg-background px-3 py-2 group-hover/row:bg-muted/30">
                    <span className="flex items-center gap-1.5">
                      <ColorDot color={row.projectColor} />
                      <span className={cn(!row.projectName && "text-muted-foreground")}>
                        {row.projectName ?? "Without project"}
                      </span>
                    </span>
                  </td>
                  {rowCells.map((cell, dayIndex) => {
                    const isEditing = editing?.row === row.key && editing?.day === dayIndex;
                    const multi = cell.entries.length > 1;
                    return (
                      <td key={dayIndex} className="px-1 py-1 text-center">
                        {isEditing ? (
                          <Input
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => commitCell(row, dayIndex)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitCell(row, dayIndex);
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="h-8 w-16 px-1 text-center text-xs tabular-nums"
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={multi}
                            title={multi ? "Multiple entries — edit in list or calendar" : undefined}
                            onClick={() => {
                              setDraft(formatTimeInput(cell.seconds || null));
                              setEditing({ row: row.key, day: dayIndex });
                            }}
                            className={cn(
                              "mx-auto flex h-8 w-16 items-center justify-center rounded border text-xs tabular-nums transition-colors",
                              cell.seconds > 0
                                ? "border-border font-medium"
                                : "border-transparent text-muted-foreground/40 hover:border-border",
                              multi ? "cursor-default border-dashed" : "hover:bg-muted"
                            )}
                          >
                            {cell.seconds > 0 ? formatDurationShort(cell.seconds) : "–"}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {rowTotal > 0 ? formatDurationShort(rowTotal) : "–"}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 font-medium">
              <td
                className="sticky left-0 z-10 w-[280px] min-w-[280px] border-r border-border-strong bg-background px-3 py-2 text-muted-foreground"
                colSpan={2}
              >
                Total
              </td>
              {dayTotals.map((t, i) => (
                <td key={i} className="px-2 py-2 text-center tabular-nums">
                  {t > 0 ? formatDurationShort(t) : "–"}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">
                {grandTotal > 0 ? formatDurationShort(grandTotal) : "–"}
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      <div className="flex items-center gap-2 p-3">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add row
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleCopyLastWeek}
          disabled={copying}
        >
          {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          Copy last week
        </Button>
      </div>

      <AddTimesheetRowDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(row) => {
          setExtraRows((prev) =>
            prev.some((r) => r.key === row.key) ? prev : [...prev, row]
          );
        }}
      />
    </div>
  );
}

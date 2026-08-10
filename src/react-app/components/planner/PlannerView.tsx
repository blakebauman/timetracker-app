import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { Plus, Copy, Loader2, AlertTriangle, CalendarRange, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorDot } from "@/components/ColorDot";
import { EmptyState } from "@/components/ui/empty-state";
import { useEntriesRange } from "@/hooks/useEntries";
import {
  useAllocationsRange,
  useUpsertAllocation,
  useBulkUpsertAllocations,
} from "@/hooks/usePlanner";
import { api } from "@/lib/api";
import { formatDurationShort, formatTimeInput, parseTimeInput } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { AddTimesheetRowDialog } from "@/components/timesheet/AddTimesheetRowDialog";
import { PlannerImportDialog } from "./PlannerImportDialog";
import type { Allocation } from "@shared/schemas";

interface PlannerViewProps {
  weekStart: Date;
}

interface RowMeta {
  key: string;
  projectId: string | null;
  taskId: string | null;
  projectName: string | null;
  projectColor: string | null;
  taskName: string | null;
}

interface PlanCell {
  planned: number;
  actual: number;
}

const rowKeyOf = (projectId: string | null, taskId: string | null) =>
  `${projectId ?? ""}__${taskId ?? ""}`;

// The Planner grid: same project/task rows × day columns as the timesheet, but
// cells hold *planned* seconds (editable, per-user) with the week's actual
// tracked time beneath for an at-a-glance plan-vs-actual. Rows appear for
// anything planned OR tracked this week, so untracked plans and unplanned work
// are both visible.
export function PlannerView({ weekStart }: PlannerViewProps) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const dayKeys = useMemo(() => days.map((d) => format(d, "yyyy-MM-dd")), [days]);
  const sinceDate = dayKeys[0];
  const untilDate = format(weekEnd, "yyyy-MM-dd");

  const {
    data: allocations = [],
    isLoading,
    isError,
    refetch,
  } = useAllocationsRange(sinceDate, untilDate);
  // Same key the TimerWorkspace header already fetches — deduped, not a second fetch.
  const { data: entries = [] } = useEntriesRange(weekStart.toISOString(), weekEnd.toISOString());

  const upsert = useUpsertAllocation();
  const bulkUpsert = useBulkUpsertAllocations();

  const [extraRows, setExtraRows] = useState<RowMeta[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [editing, setEditing] = useState<{ row: string; day: number } | null>(null);
  const [draft, setDraft] = useState("");

  const { rows, cells } = useMemo(() => {
    const rowMap = new Map<string, RowMeta>();
    const cellMap = new Map<string, PlanCell[]>();

    const ensureRow = (m: RowMeta) => {
      if (!rowMap.has(m.key)) {
        rowMap.set(m.key, m);
        cellMap.set(
          m.key,
          Array.from({ length: 7 }, () => ({ planned: 0, actual: 0 }))
        );
      }
    };

    for (const a of allocations) {
      const key = rowKeyOf(a.projectId, a.taskId);
      ensureRow({
        key,
        projectId: a.projectId,
        taskId: a.taskId,
        projectName: a.projectName,
        projectColor: a.projectColor,
        taskName: a.taskName,
      });
      // Allocations are date-keyed local strings — match by equality, no Date math.
      const dayIndex = dayKeys.indexOf(a.date);
      if (dayIndex === -1) continue;
      cellMap.get(key)![dayIndex].planned += a.plannedSeconds;
    }

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
      const start = new Date(e.start);
      const dayIndex = Math.floor(
        (new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() -
          new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).getTime()) /
          86_400_000
      );
      if (dayIndex < 0 || dayIndex > 6) continue;
      cellMap.get(key)![dayIndex].actual += e.duration ?? 0;
    }

    for (const r of extraRows) ensureRow(r);

    const rowsArr = [...rowMap.values()].sort((a, b) => {
      const pa = a.projectName ?? "￿";
      const pb = b.projectName ?? "￿";
      return pa.localeCompare(pb) || (a.taskName ?? "").localeCompare(b.taskName ?? "");
    });
    return { rows: rowsArr, cells: cellMap };
  }, [allocations, entries, extraRows, weekStart, dayKeys]);

  const dayTotals = useMemo(() => {
    const totals: PlanCell[] = Array.from({ length: 7 }, () => ({ planned: 0, actual: 0 }));
    for (const list of cells.values())
      list.forEach((c, i) => {
        totals[i].planned += c.planned;
        totals[i].actual += c.actual;
      });
    return totals;
  }, [cells]);
  const grandTotal = dayTotals.reduce(
    (acc, t) => ({ planned: acc.planned + t.planned, actual: acc.actual + t.actual }),
    { planned: 0, actual: 0 }
  );

  const commitCell = (row: RowMeta, dayIndex: number) => {
    const cell = cells.get(row.key)![dayIndex];
    setEditing(null);
    if (!row.projectId) return; // "Without project" rows can't be planned
    const parsed = parseTimeInput(draft.trim());
    const seconds = draft.trim() === "" ? 0 : parsed;
    if (seconds === null) return; // invalid input → ignore
    if (seconds === cell.planned) return;

    upsert.mutate({
      projectId: row.projectId,
      taskId: row.taskId,
      date: dayKeys[dayIndex],
      plannedSeconds: seconds,
      projectName: row.projectName,
      projectColor: row.projectColor,
      taskName: row.taskName,
    });
  };

  const handleCopyLastWeek = async () => {
    setCopying(true);
    try {
      const prevSince = format(addDays(weekStart, -7), "yyyy-MM-dd");
      const prev = (await api.planner.list({
        since: prevSince,
        until: sinceDate,
      })) as Allocation[];
      if (prev.length === 0) {
        toast.info("No plan to copy from last week");
        return;
      }
      // Snapshot this week's cells before overwriting so Undo restores what was
      // actually there (including blanks), not just zeroes.
      const snapshot = new Map<string, number>();
      for (const a of allocations)
        snapshot.set(`${a.projectId}__${a.taskId ?? ""}__${a.date}`, a.plannedSeconds);

      const copied = prev.map((a) => ({
        projectId: a.projectId,
        taskId: a.taskId,
        date: format(addDays(new Date(`${a.date}T00:00:00`), 7), "yyyy-MM-dd"),
        plannedSeconds: a.plannedSeconds,
      }));
      await bulkUpsert.mutateAsync({ allocations: copied });
      toast.success(`Copied ${prev.length} planned ${prev.length === 1 ? "cell" : "cells"} from last week`, {
        action: {
          label: "Undo",
          onClick: () =>
            bulkUpsert.mutate({
              allocations: copied.map((a) => ({
                ...a,
                plannedSeconds: snapshot.get(`${a.projectId}__${a.taskId ?? ""}__${a.date}`) ?? 0,
              })),
            }),
        },
      });
    } catch {
      toast.error("Couldn't copy last week's plan");
    } finally {
      setCopying(false);
    }
  };

  const actionButtons = (
    <>
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
        Copy last week's plan
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
        <Upload className="h-4 w-4" />
        Import CSV
      </Button>
    </>
  );

  // Planned on top (editable), actual beneath; amber only when over plan —
  // being on/under plan is normal, not a state to celebrate or punish.
  const renderPair = (cell: PlanCell, opts?: { alignRight?: boolean; strong?: boolean }) => (
    <span
      className={cn("flex flex-col leading-tight", opts?.alignRight ? "items-end" : "items-center")}
    >
      <span className={cn("tabular-nums", opts?.strong ? "font-semibold" : "font-medium")}>
        {cell.planned > 0 ? formatDurationShort(cell.planned) : "–"}
      </span>
      {(cell.planned > 0 || cell.actual > 0) && (
        <span
          className={cn(
            "text-micro tabular-nums",
            cell.actual > cell.planned
              ? "text-amber-600 dark:text-amber-500"
              : "text-muted-foreground"
          )}
        >
          {cell.actual > 0 ? formatDurationShort(cell.actual) : "–"}
        </span>
      )}
    </span>
  );

  return (
    <div className="flex h-full flex-col overflow-auto">
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
                <div className="text-micro text-muted-foreground">{format(d, "MMM d")}</div>
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
                  title="Couldn't load this week's plan"
                  description="The request didn't get through. Your plan is safe."
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
                  icon={CalendarRange}
                  title="No plan for this week"
                  description="Add a row to plan hours by project and day, copy last week's plan, or import allocations from a CSV."
                  action={<div className="flex items-center gap-2">{actionButtons}</div>}
                  className="py-0"
                />
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const rowCells = cells.get(row.key)!;
              const rowTotal = rowCells.reduce(
                (acc, c) => ({ planned: acc.planned + c.planned, actual: acc.actual + c.actual }),
                { planned: 0, actual: 0 }
              );
              const plannable = row.projectId !== null;
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
                            className="h-11 w-16 px-1 text-center text-xs tabular-nums"
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={!plannable}
                            title={
                              plannable
                                ? cell.planned > 0 || cell.actual > 0
                                  ? `Planned ${formatDurationShort(cell.planned)} · Tracked ${formatDurationShort(cell.actual)}`
                                  : undefined
                                : "Assign a project to plan these hours"
                            }
                            onClick={() => {
                              setDraft(formatTimeInput(cell.planned || null));
                              setEditing({ row: row.key, day: dayIndex });
                            }}
                            className={cn(
                              "mx-auto flex h-11 w-16 items-center justify-center rounded border text-xs transition-colors",
                              cell.planned > 0
                                ? "border-border"
                                : "border-transparent text-muted-foreground/40 hover:border-border",
                              plannable ? "hover:bg-muted" : "cursor-default border-dashed"
                            )}
                          >
                            {renderPair(cell)}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right text-xs">
                    {renderPair(rowTotal, { alignRight: true, strong: true })}
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
                <span className="flex flex-col leading-tight">
                  <span>Planned</span>
                  <span className="text-micro">Tracked</span>
                </span>
              </td>
              {dayTotals.map((t, i) => (
                <td key={i} className="px-2 py-2 text-center text-xs">
                  {renderPair(t)}
                </td>
              ))}
              <td className="px-3 py-2 text-right text-xs">
                {renderPair(grandTotal, { alignRight: true, strong: true })}
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      <div className="flex items-center gap-2 p-3">{actionButtons}</div>

      <AddTimesheetRowDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(row) => {
          if (!row.projectId) {
            toast.info("Pick a project to plan hours against");
            return;
          }
          setExtraRows((prev) =>
            prev.some((r) => r.key === row.key) ? prev : [...prev, row]
          );
        }}
      />

      <PlannerImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        weekDayKeys={dayKeys}
      />
    </div>
  );
}

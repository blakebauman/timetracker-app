import { useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ColorDot } from "@/components/ColorDot";
import { useProjects } from "@/hooks/useProjects";
import { useAllTasks } from "@/hooks/useTasks";
import { useBulkUpsertAllocations } from "@/hooks/usePlanner";
import { parseCsv } from "@/lib/csvUtils";
import { formatDurationShort, parseTimeInput } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

interface PlannerImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** The visible week's 7 yyyy-MM-dd keys — dates outside it import fine but get flagged. */
  weekDayKeys: string[];
}

interface ParsedRow {
  line: number;
  projectId: string | null;
  taskId: string | null;
  projectName: string;
  projectColor: string | null;
  taskName: string;
  date: string;
  plannedSeconds: number;
  error: string | null;
  outsideWeek: boolean;
}

// Parse the Hours column: a plain number (including decimals) means HOURS —
// deliberately different from parseTimeInput, whose bare-number branch means
// minutes (that convention fits typing "30" into a grid cell, not a CSV column
// literally named "Hours"). Everything else falls through to parseTimeInput
// ("1:30", "1h 30m", "90m").
function parseHours(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 3600);
  return parseTimeInput(s);
}

const HEADER_ALIASES: Record<string, "date" | "project" | "task" | "hours"> = {
  date: "date",
  project: "project",
  task: "task",
  hours: "hours",
  duration: "hours",
};

// CSV import for planned allocations: Date,Project,Task,Hours. Client-side
// parse + preview with per-row status; only clean rows import (via one bulk
// upsert). Duplicate cells in one file: the last row wins (upsert semantics).
export function PlannerImportDialog({ open, onClose, weekDayKeys }: PlannerImportDialogProps) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: projects = [] } = useProjects();
  const { data: tasks = [] } = useAllTasks();
  const bulkUpsert = useBulkUpsertAllocations();

  const parsed = useMemo((): { rows: ParsedRow[]; headerError: string | null } => {
    if (!text.trim()) return { rows: [], headerError: null };
    const grid = parseCsv(text);
    if (grid.length === 0) return { rows: [], headerError: null };

    const header = grid[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()]);
    const dateCol = header.indexOf("date");
    const projectCol = header.indexOf("project");
    const taskCol = header.indexOf("task");
    const hoursCol = header.indexOf("hours");
    if (dateCol === -1 || projectCol === -1 || hoursCol === -1) {
      return {
        rows: [],
        headerError:
          'Header row must include "Date", "Project" and "Hours" columns ("Task" is optional).',
      };
    }

    const weekSet = new Set(weekDayKeys);
    const rows = grid.slice(1).map((cells, i): ParsedRow => {
      const date = (cells[dateCol] ?? "").trim();
      const projectName = (cells[projectCol] ?? "").trim();
      const taskName = taskCol === -1 ? "" : (cells[taskCol] ?? "").trim();
      const hoursRaw = (cells[hoursCol] ?? "").trim();

      const row: ParsedRow = {
        line: i + 2,
        projectId: null,
        taskId: null,
        projectName,
        projectColor: null,
        taskName,
        date,
        plannedSeconds: 0,
        error: null,
        outsideWeek: false,
      };

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        row.error = "Bad date (use YYYY-MM-DD)";
        return row;
      }
      const project = projects.find(
        (p) => p.name.toLowerCase() === projectName.toLowerCase()
      );
      if (!project) {
        row.error = projectName ? `Unknown project "${projectName}"` : "Missing project";
        return row;
      }
      row.projectId = project.id;
      row.projectName = project.name;
      row.projectColor = project.color;
      if (taskName) {
        const task = tasks.find(
          (t) => t.projectId === project.id && t.name.toLowerCase() === taskName.toLowerCase()
        );
        if (!task) {
          row.error = `Unknown task "${taskName}" in ${project.name}`;
          return row;
        }
        row.taskId = task.id;
        row.taskName = task.name;
      }
      const seconds = parseHours(hoursRaw);
      if (seconds === null || seconds < 0 || seconds > 86400) {
        row.error = `Bad hours "${hoursRaw}"`;
        return row;
      }
      row.plannedSeconds = seconds;
      row.outsideWeek = !weekSet.has(date);
      return row;
    });
    return { rows, headerError: null };
  }, [text, projects, tasks, weekDayKeys]);

  const validRows = parsed.rows.filter((r) => !r.error);
  const errorCount = parsed.rows.length - validRows.length;
  // Matches BulkUpsertAllocationsSchema's cap — surface it here instead of a 400.
  const overLimit = validRows.length > 500;

  const reset = () => {
    setText("");
    if (fileRef.current) fileRef.current.value = "";
  };
  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const handleImport = async () => {
    try {
      await bulkUpsert.mutateAsync({
        allocations: validRows.map((r) => ({
          projectId: r.projectId!,
          taskId: r.taskId,
          date: r.date,
          plannedSeconds: r.plannedSeconds,
        })),
      });
      toast.success(`Imported ${validRows.length} planned ${validRows.length === 1 ? "cell" : "cells"}`);
      handleClose();
    } catch {
      // useBulkUpsertAllocations already toasts the failure.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import plan from CSV</DialogTitle>
          <DialogDescription>
            Columns: Date (YYYY-MM-DD), Project, Task (optional), Hours. Plain numbers in Hours
            mean hours ("1.5" = 1h 30m); "1:30", "1h 30m" and "90m" also work. Existing cells
            for the same project, task and date are overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Choose file
            </Button>
            <span className="text-xs text-muted-foreground">or paste below</span>
          </div>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Date,Project,Task,Hours\n2026-07-20,Website Redesign,Design,6\n2026-07-21,Website Redesign,,1:30"}
            className="min-h-28 font-mono text-xs"
          />

          {parsed.headerError && (
            <p className="text-sm text-destructive">{parsed.headerError}</p>
          )}

          {parsed.rows.length > 0 && (
            <div className="max-h-64 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-2 py-1.5 text-left font-medium">Date</th>
                    <th className="px-2 py-1.5 text-left font-medium">Project</th>
                    <th className="px-2 py-1.5 text-left font-medium">Task</th>
                    <th className="px-2 py-1.5 text-right font-medium">Planned</th>
                    <th className="px-2 py-1.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((r) => (
                    <tr key={r.line} className={cn("border-b last:border-0", r.error && "opacity-60")}>
                      <td className="px-2 py-1.5 tabular-nums">{r.date}</td>
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-1.5">
                          {r.projectId && <ColorDot color={r.projectColor} />}
                          {r.projectName || "—"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">{r.taskName || "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {r.error ? "—" : formatDurationShort(r.plannedSeconds)}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.error ? (
                          <span className="text-destructive">{r.error}</span>
                        ) : r.outsideWeek ? (
                          <span className="text-amber-600 dark:text-amber-500">
                            Outside visible week
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {errorCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {errorCount} {errorCount === 1 ? "row" : "rows"} with errors will be skipped.
            </p>
          )}
          {overLimit && (
            <p className="text-xs text-destructive">
              Imports are capped at 500 rows — split the file and import in batches.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={validRows.length === 0 || overLimit || bulkUpsert.isPending}
          >
            Import {validRows.length > 0 ? `${validRows.length} ${validRows.length === 1 ? "row" : "rows"}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

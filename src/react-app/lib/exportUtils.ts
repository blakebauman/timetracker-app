import { formatSeconds, formatEntryTime } from "./dateUtils";

interface ExportEntry {
  start: string;
  stop: string | null;
  duration: number | null;
  description: string;
  projectName?: string | null;
  clientName?: string | null;
  taskName?: string | null;
  billable: boolean;
  amount?: number;
  tags: string[];
}

export function exportToCSV(entries: ExportEntry[], filename = "time-entries"): void {
  const headers = [
    "Date",
    "Start",
    "Stop",
    "Duration",
    "Description",
    "Client",
    "Project",
    "Task",
    "Billable",
    "Amount",
    "Tags",
  ];

  const rows = entries.map((e) => [
    e.start.slice(0, 10),
    formatEntryTime(e.start),
    e.stop ? formatEntryTime(e.stop) : "",
    e.duration ? formatSeconds(e.duration) : "",
    `"${(e.description ?? "").replace(/"/g, '""')}"`,
    `"${(e.clientName ?? "").replace(/"/g, '""')}"`,
    `"${(e.projectName ?? "").replace(/"/g, '""')}"`,
    `"${(e.taskName ?? "").replace(/"/g, '""')}"`,
    e.billable ? "Yes" : "No",
    (e.amount ?? 0).toFixed(2),
    `"${(e.tags ?? []).join(", ")}"`,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

import { formatSeconds, formatEntryTime } from "./dateUtils";

interface ExportEntry {
  start: string;
  stop: string | null;
  duration: number | null;
  description: string;
  projectName?: string | null;
  billable: boolean;
  tags: string[];
}

export function exportToCSV(entries: ExportEntry[], filename = "time-entries"): void {
  const headers = [
    "Date",
    "Start",
    "Stop",
    "Duration",
    "Description",
    "Project",
    "Billable",
    "Tags",
  ];

  const rows = entries.map((e) => [
    e.start.slice(0, 10),
    formatEntryTime(e.start),
    e.stop ? formatEntryTime(e.stop) : "",
    e.duration ? formatSeconds(e.duration) : "",
    `"${(e.description ?? "").replace(/"/g, '""')}"`,
    `"${(e.projectName ?? "").replace(/"/g, '""')}"`,
    e.billable ? "Yes" : "No",
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

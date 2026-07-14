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
  download(`${filename}.csv`, csv, "text/csv;charset=utf-8;");
}

// Excel export: an HTML table with an .xls extension + Excel MIME type. Excel
// opens it natively as a spreadsheet (no external library needed).
export function exportToExcel(entries: ExportEntry[], filename = "time-entries"): void {
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
  const esc = (v: string | number) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const body = entries
    .map((e) => {
      const cells = [
        e.start.slice(0, 10),
        formatEntryTime(e.start),
        e.stop ? formatEntryTime(e.stop) : "",
        e.duration ? formatSeconds(e.duration) : "",
        e.description ?? "",
        e.clientName ?? "",
        e.projectName ?? "",
        e.taskName ?? "",
        e.billable ? "Yes" : "No",
        (e.amount ?? 0).toFixed(2),
        (e.tags ?? []).join(", "),
      ];
      return `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
    })
    .join("");

  const html =
    `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>` +
    `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` +
    `<tbody>${body}</tbody></table></body></html>`;

  download(`${filename}.xls`, html, "application/vnd.ms-excel");
}

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

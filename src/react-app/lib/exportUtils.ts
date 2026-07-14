import { formatSeconds, formatEntryTime } from "./dateUtils";
import { buildXlsx } from "./xlsx";

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

const EXPORT_HEADERS = [
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

// Row cells shared by CSV and XLSX (Amount kept numeric for spreadsheets).
function exportRow(e: ExportEntry): (string | number)[] {
  return [
    e.start.slice(0, 10),
    formatEntryTime(e.start),
    e.stop ? formatEntryTime(e.stop) : "",
    e.duration ? formatSeconds(e.duration) : "",
    e.description ?? "",
    e.clientName ?? "",
    e.projectName ?? "",
    e.taskName ?? "",
    e.billable ? "Yes" : "No",
    Number((e.amount ?? 0).toFixed(2)),
    (e.tags ?? []).join(", "),
  ];
}

export function exportToCSV(entries: ExportEntry[], filename = "time-entries"): void {
  const csvCell = (v: string | number) =>
    typeof v === "number" ? String(v) : `"${v.replace(/"/g, '""')}"`;
  const lines = [
    EXPORT_HEADERS.join(","),
    ...entries.map((e) => exportRow(e).map(csvCell).join(",")),
  ];
  download(`${filename}.csv`, new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }));
}

// Real .xlsx (OOXML) via the dependency-free writer — opens in Excel/Sheets
// without the format-mismatch warning the old HTML-table .xls trick produced.
export function exportToExcel(entries: ExportEntry[], filename = "time-entries"): void {
  const rows = [EXPORT_HEADERS, ...entries.map(exportRow)];
  const bytes = buildXlsx("Time entries", rows);
  download(
    `${filename}.xlsx`,
    new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );
}

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

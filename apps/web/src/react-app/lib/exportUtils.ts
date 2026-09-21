import { formatSeconds, formatEntryTime, localDayKey } from "./dateUtils";
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
    // Local date, matching the Date column to the Start time beside it — the
    // UTC slice dated an 18:00 entry to the next day for anyone west of UTC.
    localDayKey(e.start),
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

// A cell that starts with = + - @ or a tab/CR is executed as a formula by
// spreadsheet apps when the CSV is opened — quoting does not stop it. A
// description like `=HYPERLINK(...)` (typed by a teammate, or arriving via a
// calendar title) would run on the reviewer's machine. Prefix a literal
// apostrophe, the standard neutraliser; the XLSX path writes inline strings
// and is not affected.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvCell(v: string | number): string {
  if (typeof v === "number") return String(v);
  const s = FORMULA_LEAD.test(v) ? `'${v}` : v;
  return `"${s.replace(/"/g, '""')}"`;
}

export function exportToCSV(entries: ExportEntry[], filename = "time-entries"): void {
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
